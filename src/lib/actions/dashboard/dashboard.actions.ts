'use server';

import { createClient } from '@/lib/supabase/server';

const TENANT_ID = 'STX-001';

// ─── Pipeline stage order (akhir → awal) untuk penentuan tahap terkini ─────────
const STAGE_ORDER = [
  'packing',
  'steam',
  'qc',
  'lubang_kancing',
  'buang_benang',
  'jahit',
  'cutting',
] as const;

export interface DashboardKPI {
  po_aktif: number;
  bundle_selesai_bulan_ini: number;
  bundle_berjalan: number;
  reject_bulan_ini: number;
  gaji_belum_bayar_nominal: number;
  gaji_belum_bayar_karyawan: number;
  kasbon_outstanding: number;
  total_bayar_gaji_bulan_ini: number;
  inventory_kritis: number;
  chart_pipeline: { tahap: string; jumlah: number }[];
  chart_output_mingguan: { label: string; jumlah: number }[];
}

// ─── Helper: Hitung batas tanggal dari bulan + tahun ────────────────────────
function getStartDate(bulan: string, tahun: string): string {
  return `${tahun}-${bulan.padStart(2, '0')}-01`;
}

function getEndDate(bulan: string, tahun: string): string {
  const mm = bulan.padStart(2, '0');
  const lastDay = new Date(Number(tahun), Number(mm), 0).getDate();
  return `${tahun}-${mm}-${String(lastDay).padStart(2, '0')}`;
}

// ─── Helper: Default bulan & tahun saat ini ──────────────────────────────────
function resolveFilter(
  bulan_dari?: string,
  tahun_dari?: string,
  bulan_sampai?: string,
  tahun_sampai?: string
): { bulan_dari: string; tahun_dari: string; bulan_sampai: string; tahun_sampai: string } {
  const now = new Date();
  const currentMonth = String(now.getMonth() + 1);
  const currentYear = String(now.getFullYear());
  return {
    bulan_dari: bulan_dari ?? currentMonth,
    tahun_dari: tahun_dari ?? currentYear,
    bulan_sampai: bulan_sampai ?? currentMonth,
    tahun_sampai: tahun_sampai ?? currentYear,
  };
}

// ─── Main Function ───────────────────────────────────────────────────────────
export async function getDashboardKPI(
  bulan_dari?: string,
  tahun_dari?: string,
  bulan_sampai?: string,
  tahun_sampai?: string
): Promise<DashboardKPI> {
  const supabase = await createClient();
  const {
    bulan_dari: b_dari,
    tahun_dari: t_dari,
    bulan_sampai: b_sampai,
    tahun_sampai: t_sampai,
  } = resolveFilter(bulan_dari, tahun_dari, bulan_sampai, tahun_sampai);

  const start = getStartDate(b_dari, t_dari);
  const end = getEndDate(b_sampai, t_sampai);

  // ═══════════════════════════════���═══════════════════════════════════════════
  // PARALLEL QUERIES — run all 8 data fetches concurrently instead of sequential
  // ═══════════════════════════════════════════════════════════════════════════

  const [
    poResult,
    bundleResult,
    rejectResult,
    ledgerResult,
    kasbonResult,
    paymentResult,
    inventoryResult,
    scanResult,
  ] = await Promise.all([
    // 1. PO Aktif
    supabase.from('po').select('id').eq('tenant_id', TENANT_ID).in('status', ['draft', 'aktif']),
    // 2. Bundle — only fetch status_tahap (NOT id + full row)
    supabase.from('bundle').select('status_tahap').eq('tenant_id', TENANT_ID),
    // 3. Reject count
    supabase.from('koreksi_qty').select('id').eq('tenant_id', TENANT_ID).eq('tipe', 'reject')
      .gte('created_at', `${start}T00:00:00`).lte('created_at', `${end}T23:59:59`),
    // 4. Gaji belum bayar
    supabase.from('gaji_ledger').select('karyawan_id, total').eq('tenant_id', TENANT_ID).eq('status', 'belum_lunas'),
    // 5. Kasbon outstanding
    supabase.from('kasbon').select('jumlah').eq('tenant_id', TENANT_ID).eq('status', 'belum_lunas'),
    // 6. Total bayar gaji bulan ini
    supabase.from('gaji_ledger').select('total').eq('tenant_id', TENANT_ID).eq('status', 'lunas')
      .gte('tanggal_bayar', `${start}`).lte('tanggal_bayar', `${end}`),
    // 7. Inventory kritis
    supabase.from('inventory_item').select('stok_aktual, stok_minimum').eq('tenant_id', TENANT_ID)
      .not('stok_minimum', 'is', null),
    // 8. Scan log for chart
    supabase.from('scan_log').select('created_at').eq('tenant_id', TENANT_ID).eq('tipe', 'selesai')
      .gte('created_at', `${start}T00:00:00`).lte('created_at', `${end}T23:59:59`),
  ]);

  // ── 1. PO Aktif ─────────────────────────────────────────────────────────────
  if (poResult.error) throw new Error('po_aktif: ' + poResult.error.message);
  const po_aktif = poResult.count ?? (poResult.data?.length ?? 0);

  // ── 2. Bundle (selesai + berjalan + chart_pipeline) ──────────────────────────
  if (bundleResult.error) throw new Error('bundle: ' + bundleResult.error.message);

  let bundle_selesai_bulan_ini = 0;
  let bundle_berjalan = 0;
  const pipelineCount: Record<string, number> = {};

  (bundleResult.data ?? []).forEach((row: any) => {
    const st = row.status_tahap ?? {};
    const packingStatus = st?.packing?.status;
    const packingWaktuSelesai: string | undefined = st?.packing?.waktu_selesai;

    const isSelesai =
      packingStatus === 'selesai' &&
      packingWaktuSelesai &&
      packingWaktuSelesai >= `${start}T00:00:00` &&
      packingWaktuSelesai <= `${end}T23:59:59`;

    if (isSelesai) {
      bundle_selesai_bulan_ini += 1;
    } else if (packingStatus !== 'selesai') {
      bundle_berjalan += 1;
    }

    let currentStage = 'belum_mulai';
    for (const stage of STAGE_ORDER) {
      if (st?.[stage]?.status === 'selesai' || st?.[stage]?.status === 'berjalan') {
        currentStage = stage;
        break;
      }
    }
    pipelineCount[currentStage] = (pipelineCount[currentStage] ?? 0) + 1;
  });

  const PIPELINE_LABELS = [...STAGE_ORDER, 'belum_mulai'] as string[];
  const chart_pipeline = PIPELINE_LABELS
    .filter((s) => pipelineCount[s] !== undefined)
    .map((s) => ({ tahap: s, jumlah: pipelineCount[s] ?? 0 }));

  // ── 3. Reject ────────────────────────────────────────────────────────────────
  if (rejectResult.error) console.error('koreksi_qty reject:', rejectResult.error.message);
  const reject_bulan_ini = (rejectResult.data ?? []).length;

  // ── 4. Gaji Belum Bayar ──────────────────────────────────────────────────────
  if (ledgerResult.error) throw new Error('gaji_ledger: ' + ledgerResult.error.message);
  let gaji_belum_bayar_nominal = 0;
  const uniqueKaryawan = new Set<string>();
  (ledgerResult.data ?? []).forEach((row: any) => {
    gaji_belum_bayar_nominal += Number(row.total) || 0;
    if (row.karyawan_id) uniqueKaryawan.add(row.karyawan_id);
  });
  const gaji_belum_bayar_karyawan = uniqueKaryawan.size;

  // ── 5. Kasbon ────────────────────────────────────────────────────────────────
  if (kasbonResult.error) throw new Error('kasbon: ' + kasbonResult.error.message);
  const kasbon_outstanding = (kasbonResult.data ?? []).reduce(
    (acc: number, row: any) => acc + (Number(row.jumlah) || 0), 0
  );

  // ── 6. Total Bayar Gaji ──────────────────────────────────────────────────────
  if (paymentResult.error) console.error('gaji_ledger payment:', paymentResult.error.message);
  const total_bayar_gaji_bulan_ini = (paymentResult.data ?? []).reduce(
    (acc: number, row: any) => acc + (Number(row.total) || 0), 0
  );

  // ── 7. Inventory Kritis ──────────────────────────────────────────────────────
  if (inventoryResult.error) throw new Error('inventory_item: ' + inventoryResult.error.message);
  const inventory_kritis = (inventoryResult.data ?? []).filter(
    (i: any) => Number(i.stok_aktual) < Number(i.stok_minimum)
  ).length;

  // ── 8. Chart Output Mingguan ─────────────────────────────────────────────────
  if (scanResult.error) throw new Error('scan_log: ' + scanResult.error.message);

  const isSingleMonth = b_dari === b_sampai && t_dari === t_sampai;
  const counts: Record<string, number> = {};
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  (scanResult.data ?? []).forEach((row: any) => {
    const d = new Date(row.created_at);
    if (isSingleMonth) {
      const day = d.getDate();
      const minggu = Math.ceil(day / 7);
      counts[minggu] = (counts[minggu] ?? 0) + 1;
    } else {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  });

  let chart_output_mingguan: { label: string; jumlah: number }[] = [];
  
  if (isSingleMonth) {
    chart_output_mingguan = Object.entries(counts)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([minggu, jumlah]) => ({ label: `Minggu ${minggu}`, jumlah }));
  } else {
    chart_output_mingguan = Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, jumlah]) => {
        const [yyyy, mm] = key.split('-');
        const monthIndex = parseInt(mm, 10) - 1;
        return { label: `${monthNames[monthIndex]} ${yyyy}`, jumlah };
      });
  }

  // ── Return ───────────────────────────────────────────────────────────────────
  return {
    po_aktif,
    bundle_selesai_bulan_ini,
    bundle_berjalan,
    reject_bulan_ini,
    gaji_belum_bayar_nominal,
    gaji_belum_bayar_karyawan,
    kasbon_outstanding,
    total_bayar_gaji_bulan_ini,
    inventory_kritis,
    chart_pipeline,
    chart_output_mingguan,
  };
}
