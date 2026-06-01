'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUserProfile } from '@/lib/auth/permissions';

const TENANT_ID = 'STX-001';

export interface MonitoringStats {
  po_aktif: number;
  total_bundle: number;
  bundle_selesai: number;
  bermasalah: number;
}

export interface PoRow {
  id: string;
  no_po: string;
  klien_nama: string;
  total_bundle: number;
  progress: Record<string, { done: number; total: number }>;
}

export interface PoGrouped {
  belum_mulai: PoRow[];
  sedang_diproses: PoRow[];
  selesai: PoRow[];
}

export interface ArtikelRow {
  id: string;
  no_po: string;
  klien_nama: string;
  model_nama: string;
  warna: string;
  size: string;
  qty_order: number;
  total_bundle: number;
  progress: Record<string, { done: number; total: number; pct: number }>;
}

export interface WarningRow {
  bundle_id: string;
  barcode: string;
  no_po: string;
  tahap: string;
  jenis: 'mandek';
  detail: string;
  waktu: string;
}

const STAGES = ['cutting', 'jahit', 'buang_benang', 'lubang_kancing', 'qc', 'steam', 'packing'];

/**
 * Mengambil ringkasan statistik produksi untuk dashboard monitoring.
 */
export async function getMonitoringStats(): Promise<MonitoringStats> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();

  // Run all 4 queries in PARALLEL instead of sequential waterfall
  const [poResult, bundleResult, logsResult, warnings] = await Promise.all([
    // 1. PO Aktif
    supabase.from('po').select('id').eq('status', 'aktif').eq('tenant_id', TENANT_ID),
    // 2. Total Bundle
    supabase.from('bundle').select('id').eq('tenant_id', TENANT_ID),
    // 3. Bundle Selesai (packing selesai)
    supabase.from('scan_log').select('bundle_id').eq('tahap', 'packing').eq('tipe', 'selesai').eq('tenant_id', TENANT_ID),
    // 4. Warnings (mandek)
    getMonitoringWarnings(24),
  ]);

  if (poResult.error) throw new Error(`Gagal hitung PO aktif: ${poResult.error.message}`);
  if (bundleResult.error) throw new Error(`Gagal hitung total bundle: ${bundleResult.error.message}`);
  if (logsResult.error) throw new Error(`Gagal ambil logs packing: ${logsResult.error.message}`);

  const uniqueSelesaiCount = new Set((logsResult.data ?? []).map((l: any) => l.bundle_id)).size;

  return {
    po_aktif: (poResult.data ?? []).length,
    total_bundle: (bundleResult.data ?? []).length,
    bundle_selesai: uniqueSelesaiCount,
    bermasalah: warnings.length,
  };
}

/**
 * Mengambil daftar PO aktif yang dikelompokkan berdasarkan kemajuan produksi.
 */
export async function getPoGrouped(): Promise<PoGrouped> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();

  // Fetch PO aktif + bundle + scan_log
  const { data, error } = await supabase
    .from('po')
    .select(`
      id, no_po, status,
      klien:klien_id(nama),
      bundle(
        id,
        scan_log(tahap, tipe)
      )
    `)
    .eq('status', 'aktif')
    .eq('tenant_id', TENANT_ID);

  if (error) throw new Error(`Gagal ambil data PO grouped: ${error.message}`);

  const belum_mulai: PoRow[] = [];
  const sedang_diproses: PoRow[] = [];
  const selesai: PoRow[] = [];

  (data as any[]).forEach((po) => {
    const total_bundle = po.bundle?.length ?? 0;
    const progress: Record<string, { done: number; total: number }> = {};
    
    // Initialize progress for all stages
    STAGES.forEach(s => progress[s] = { done: 0, total: total_bundle });

    let hasAnyScan = false;
    let allFinishedPacking = total_bundle > 0;

    po.bundle?.forEach((b: any) => {
      const logs = b.scan_log || [];
      if (logs.length > 0) hasAnyScan = true;

      // Check per stage completion for this bundle
      STAGES.forEach(stage => {
        const isDone = logs.some((l: any) => l.tahap === stage && l.tipe === 'selesai');
        if (isDone) progress[stage].done++;
      });

      // Special check for packing
      const isPackingDone = logs.some((l: any) => l.tahap === 'packing' && l.tipe === 'selesai');
      if (!isPackingDone) allFinishedPacking = false;
    });

    const row: PoRow = {
      id: po.id,
      no_po: po.no_po,
      klien_nama: po.klien?.nama ?? '-',
      total_bundle,
      progress
    };

    if (!hasAnyScan && total_bundle > 0) {
      belum_mulai.push(row);
    } else if (allFinishedPacking && total_bundle > 0) {
      selesai.push(row);
    } else {
      sedang_diproses.push(row);
    }
  });

  return { belum_mulai, sedang_diproses, selesai };
}

/**
 * Mengambil data monitoring per artikel (po_item) untuk seluruh PO aktif.
 */
export async function getMonitoringPerArtikel(): Promise<ArtikelRow[]> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();

  // Fetch po_item + po + produk + model + bundle + scan_log
  const { data, error } = await supabase
    .from('po_item')
    .select(`
      id, warna, size, qty_order,
      po:po_id(
        no_po,
        status,
        klien:klien_id(nama)
      ),
      produk:produk_id(
        model:model_id(nama)
      ),
      bundle(
        id,
        scan_log(tahap, tipe)
      )
    `)
    .eq('tenant_id', TENANT_ID);

  if (error) throw new Error(`Gagal ambil data monitoring artikel: ${error.message}`);

  // Tapis data yang po-nya aktif
  const filteredData = (data as any[]).filter(item => item.po !== null && item.po.status === 'aktif');

  const result: ArtikelRow[] = filteredData.map((item) => {
    const total_bundle = item.bundle?.length ?? 0;
    const progress: Record<string, { done: number; total: number; pct: number }> = {};

    STAGES.forEach(s => {
      progress[s] = { done: 0, total: total_bundle, pct: 0 };
    });

    item.bundle?.forEach((b: any) => {
      const logs = b.scan_log || [];
      STAGES.forEach(stage => {
        const isDone = logs.some((l: any) => l.tahap === stage && l.tipe === 'selesai');
        if (isDone) progress[stage].done++;
      });
    });

    // Hitung pct
    STAGES.forEach(s => {
      if (progress[s].total > 0) {
        progress[s].pct = Math.round((progress[s].done / progress[s].total) * 100);
      }
    });

    return {
      id: item.id,
      no_po: item.po.no_po,
      klien_nama: item.po.klien?.nama ?? '-',
      model_nama: item.produk?.model?.nama ?? '-',
      warna: item.warna,
      size: item.size,
      qty_order: item.qty_order,
      total_bundle,
      progress
    };
  });

  return result;
}

/**
 * Mengambil daftar warning (bundle mandek) berdasarkan ambang batas jam.
 */
export async function getMonitoringWarnings(thresholdHours: number): Promise<WarningRow[]> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();

  // 1. Fetch all scan_log within active POs
  const { data, error } = await supabase
    .from('scan_log')
    .select(`
      id, bundle_id, tahap, tipe, created_at,
      bundle:bundle_id(
        barcode,
        po:po_id(no_po, status)
      )
    `)
    .eq('tenant_id', TENANT_ID);

  if (error) throw new Error(`Gagal ambil logs for warnings: ${error.message}`);

  const logs = (data as any[]).filter(l => 
    l.bundle !== null && 
    l.bundle.po !== null && 
    l.bundle.po.status !== 'dibatalkan' && 
    l.bundle.po.status !== 'selesai'
  );
  
  // 2. Identify stuck bundles
  const result: WarningRow[] = [];
  const now = new Date();

  // Group logs by bundle_id + tahap
  const groups: Record<string, any[]> = {};
  logs.forEach(l => {
    const key = `${l.bundle_id}-${l.tahap}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(l);
  });

  Object.values(groups).forEach(groupLogs => {
    const terimaLog = groupLogs.find(l => l.tipe === 'terima');
    const selesaiLog = groupLogs.find(l => l.tipe === 'selesai');

    if (terimaLog && !selesaiLog) {
      const startTime = new Date(terimaLog.created_at);
      const diffMs = now.getTime() - startTime.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours > thresholdHours) {
        result.push({
          bundle_id: terimaLog.bundle_id,
          barcode: terimaLog.bundle.barcode,
          no_po: terimaLog.bundle.po.no_po,
          tahap: terimaLog.tahap,
          jenis: 'mandek',
          detail: `Sudah >${thresholdHours} jam belum diselesaikan`,
          waktu: terimaLog.created_at
        });
      }
    }
  });

  return result;
}
