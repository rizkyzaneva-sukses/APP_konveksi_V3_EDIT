'use server';

import { createClient } from '@/lib/supabase/server';

const TENANT_ID = 'STX-001';

export interface LaporanGajiData {
  total_upah_sudah_bayar: number;
  total_upah_belum_bayar: number;
  total_kasbon_outstanding: number;

  per_karyawan: {
    karyawan_id: string;
    karyawan_nama: string;
    upah_sudah_bayar: number;
    upah_belum_bayar: number;
    kasbon_sisa: number;
  }[];

  history_pembayaran: {
    tanggal_bayar: string;
    karyawan_nama: string;
    jumlah_dibayar: number;
  }[];
}

export async function getLaporanGaji(filters?: {
  bulan?: string;
  tahun?: string;
}): Promise<LaporanGajiData> {
  const supabase = await createClient();

  // 1. Fetch gaji_ledger
  let ledgerQuery = supabase
    .from('gaji_ledger')
    .select('karyawan_id, tipe, total, status, tanggal_bayar, karyawan:karyawan_id(nama)')
    .eq('tenant_id', TENANT_ID)
    .in('tipe', ['selesai', 'rework', 'reject_potong']);

  if (filters?.bulan && filters?.tahun) {
    const mm = filters.bulan.padStart(2, '0');
    const lastDay = new Date(Number(filters.tahun), Number(mm), 0).getDate();
    ledgerQuery = ledgerQuery
      .gte('tanggal', `${filters.tahun}-${mm}-01`)
      .lte('tanggal', `${filters.tahun}-${mm}-${String(lastDay).padStart(2, '0')}`);
  } else if (filters?.tahun) {
    ledgerQuery = ledgerQuery
      .gte('tanggal', `${filters.tahun}-01-01`)
      .lte('tanggal', `${filters.tahun}-12-31`);
  }

  const { data: ledgerData, error: ledgerError } = await ledgerQuery;
  if (ledgerError) throw new Error(ledgerError.message);

  // 2. Fetch kasbon outstanding (no date filter — always current)
  const { data: kasbonData, error: kasbonError } = await supabase
    .from('kasbon')
    .select('karyawan_id, jumlah, karyawan:karyawan_id(nama)')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'belum_lunas');

  if (kasbonError) throw new Error(kasbonError.message);

  // ─── Aggregation ───
  const karyawanMap: Record<string, {
    nama: string;
    upah_sudah_bayar: number;
    upah_belum_bayar: number;
    kasbon_sisa: number;
  }> = {};

  const ensureKaryawan = (id: string, nama: string) => {
    if (!karyawanMap[id]) {
      karyawanMap[id] = { nama, upah_sudah_bayar: 0, upah_belum_bayar: 0, kasbon_sisa: 0 };
    }
  };

  let total_upah_sudah_bayar = 0;
  let total_upah_belum_bayar = 0;

  (ledgerData ?? []).forEach((row: any) => {
    const karyawanNama = (row.karyawan as any)?.nama ?? '-';
    ensureKaryawan(row.karyawan_id, karyawanNama);
    const amount = Math.abs(Number(row.total));
    const isDeduction = row.tipe === 'reject_potong';

    if (row.status === 'lunas') {
      // Upah positif (selesai / rework) ditambah; potongan (reject_potong) dikurangi
      const signedAmount = isDeduction ? -amount : amount;
      total_upah_sudah_bayar += signedAmount;
      karyawanMap[row.karyawan_id].upah_sudah_bayar += signedAmount;
    } else if (row.status === 'belum_lunas') {
      const signedAmount = isDeduction ? -amount : amount;
      total_upah_belum_bayar += signedAmount;
      karyawanMap[row.karyawan_id].upah_belum_bayar += signedAmount;
    }
  });

  // 3. History pembayaran dari gaji_ledger status lunas
  let paymentQuery = supabase
    .from('gaji_ledger')
    .select('tanggal_bayar, total, karyawan_id')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'lunas')
    .order('tanggal_bayar', { ascending: false });

  if (filters?.bulan && filters?.tahun) {
    const mm = filters.bulan.padStart(2, '0');
    const lastDay = new Date(Number(filters.tahun), Number(mm), 0).getDate();
    paymentQuery = paymentQuery
      .gte('tanggal_bayar', `${filters.tahun}-${mm}-01`)
      .lte('tanggal_bayar', `${filters.tahun}-${mm}-${String(lastDay).padStart(2, '0')}`);
  } else if (filters?.tahun) {
    paymentQuery = paymentQuery
      .gte('tanggal_bayar', `${filters.tahun}-01-01`)
      .lte('tanggal_bayar', `${filters.tahun}-12-31`);
  }

  const { data: paymentData, error: paymentError } = await paymentQuery;

  if (paymentError) console.error('laporan gaji payment:', paymentError.message);

  const history_pembayaran = (paymentData ?? []).map((p: any) => ({
    tanggal_bayar: p.tanggal_bayar ?? '-',
    karyawan_nama: karyawanMap[p.karyawan_id]?.nama ?? '-',
    jumlah_dibayar: Number(p.total) || 0,
  }));

  // 4. Kasbon aggregation
  let total_kasbon_outstanding = 0;
  (kasbonData ?? []).forEach((row: any) => {
    const karyawanNama = (row.karyawan as any)?.nama ?? '-';
    ensureKaryawan(row.karyawan_id, karyawanNama);
    const amount = Number(row.jumlah) || 0;
    if (amount > 0) {
      total_kasbon_outstanding += amount;
      karyawanMap[row.karyawan_id].kasbon_sisa += amount;
    }
  });

  const per_karyawan = Object.entries(karyawanMap)
    .map(([karyawan_id, v]) => ({
      karyawan_id,
      karyawan_nama: v.nama,
      upah_sudah_bayar: v.upah_sudah_bayar,
      upah_belum_bayar: v.upah_belum_bayar,
      kasbon_sisa: v.kasbon_sisa,
    }))
    .sort((a, b) => a.karyawan_nama.localeCompare(b.karyawan_nama));


  return {
    total_upah_sudah_bayar,
    total_upah_belum_bayar,
    total_kasbon_outstanding,
    per_karyawan,
    history_pembayaran,
  };
}
