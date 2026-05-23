// =============================================================================
// src/db/schema.ts
// Drizzle ORM Schema — Stitchlyx Syncore V3
// Source of truth untuk type-safe DB queries.
// Dibuat: 20 April 2026
// =============================================================================

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  date,
  jsonb,
  integer,
  numeric,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// =============================================================================
// ENUMs
// =============================================================================

export const userRoleEnum = pgEnum('user_role', [
  'owner',
  'admin_produksi',
  'admin_keuangan',
  'supervisor',
  'mandor',
]);

export const jenisTrxEnum = pgEnum('jenis_trx', [
  'direct_bahan',
  'direct_upah',
  'overhead',
  'masuk',
]);

export const poStatusEnum = pgEnum('po_status', [
  'draft',
  'aktif',
  'selesai',
  'dibatalkan',
]);

export const scanTipeEnum = pgEnum('scan_tipe', ['terima', 'selesai']);

export const tahapProduksiEnum = pgEnum('tahap_produksi', [
  'cutting',
  'jahit',
  'buang_benang',
  'lubang_kancing',
  'steam',
  'packing',
  'qc',
]);

export const koreksiTipeEnum = pgEnum('koreksi_tipe', [
  'reject',
  'hilang',
  'lebih',
]);

export const koreksiStatusEnum = pgEnum('koreksi_status', [
  'pending',
  'approved',
  'cancelled',
]);

export const gajiLedgerTipeEnum = pgEnum('gaji_ledger_tipe', [
  'selesai',
  'reject_potong',
  'rework',
]);

export const gajiStatusEnum = pgEnum('gaji_status', [
  'belum_lunas',
  'lunas',
  'escrow',
  'cancelled',
]);

export const kasbonStatusEnum = pgEnum('kasbon_status', [
  'belum_lunas',
  'lunas',
]);

export const sjStatusEnum = pgEnum('sj_status', ['draft', 'final']);


// =============================================================================
// TABEL: user_profile
// Auth mandiri — email + password_hash disimpan langsung di tabel ini.
// =============================================================================

export const userProfile = pgTable('user_profile', {
  id:           uuid('id').primaryKey().defaultRandom(),
  email:        text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  nama:         text('nama').notNull(),
  role:         userRoleEnum('role').notNull().default('mandor'),
  aktif:        boolean('aktif').notNull().default(true),
  tenantId:     text('tenant_id').notNull().default('STX-001'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});


// =============================================================================
// TABEL: jabatan
// =============================================================================

export const jabatan = pgTable('jabatan', {
  id:              uuid('id').primaryKey().defaultRandom(),
  nama:            text('nama').notNull(),
  deskripsi:       text('deskripsi'),
  tahapProduksi:   text('tahap_produksi').array().notNull().default([]),
  gajiDefault:     numeric('gaji_default', { precision: 12, scale: 2 }).notNull().default('0'),
  aktif:           boolean('aktif').notNull().default(true),
  tenantId:        text('tenant_id').notNull().default('STX-001'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});


// =============================================================================
// TABEL: karyawan
// =============================================================================

export const karyawan = pgTable('karyawan', {
  id:         uuid('id').primaryKey().defaultRandom(),
  nama:       text('nama').notNull(),
  jabatan:    text('jabatan').notNull(),
  gajiPokok:  numeric('gaji_pokok', { precision: 12, scale: 2 }).notNull().default('0'),
  aktif:      boolean('aktif').notNull().default(true),
  tenantId:   text('tenant_id').notNull().default('STX-001'),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:  uuid('created_by').references(() => userProfile.id),
});


// =============================================================================
// TABEL: klien
// =============================================================================

export const klien = pgTable('klien', {
  id:        uuid('id').primaryKey().defaultRandom(),
  nama:      text('nama').notNull(),
  alamat:    text('alamat'),
  kontak:    text('kontak'),
  tenantId:  text('tenant_id').notNull().default('STX-001'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => userProfile.id),
});


// =============================================================================
// TABEL: kategori_trx
// =============================================================================

export const kategoriTrx = pgTable('kategori_trx', {
  id:        uuid('id').primaryKey().defaultRandom(),
  nama:      text('nama').notNull(),
  jenis:     jenisTrxEnum('jenis').notNull(),
  aktif:     boolean('aktif').notNull().default(true),
  tenantId:  text('tenant_id').notNull().default('STX-001'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});


// =============================================================================
// TABEL: po (Purchase Order)
// =============================================================================

export const po = pgTable('po', {
  id:             uuid('id').primaryKey().defaultRandom(),
  noPo:           text('no_po').notNull().unique(),
  klienId:        uuid('klien_id').notNull().references(() => klien.id),
  status:         poStatusEnum('status').notNull().default('draft'),
  tanggalOrder:   date('tanggal_order').notNull(),
  tanggalTarget:  date('tanggal_target').notNull(),
  catatan:        text('catatan'),
  tenantId:       text('tenant_id').notNull().default('STX-001'),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:      uuid('created_by').references(() => userProfile.id),
});


// =============================================================================
// TABEL: po_item
// =============================================================================

export const poItem = pgTable('po_item', {
  id:            uuid('id').primaryKey().defaultRandom(),
  poId:          uuid('po_id').notNull().references(() => po.id, { onDelete: 'cascade' }),
  produkId:      uuid('produk_id'),  // FK ke tabel produk (migration selanjutnya)
  warna:         text('warna').notNull(),
  size:          text('size').notNull(),
  qtyOrder:      integer('qty_order').notNull(),
  qtyPerBundle:  integer('qty_per_bundle').notNull().default(12),
  hppEstimasi:   numeric('hpp_estimasi', { precision: 14, scale: 2 }).notNull().default('0'),
  tenantId:      text('tenant_id').notNull().default('STX-001'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});


// =============================================================================
// TABEL: surat_jalan (harus dideklarasikan sebelum bundle karena bundle FK ke sini)
// =============================================================================

export const suratJalan = pgTable('surat_jalan', {
  id:        uuid('id').primaryKey().defaultRandom(),
  nomorSj:   text('nomor_sj').notNull().unique(),
  klienId:   uuid('klien_id').notNull().references(() => klien.id),
  tanggal:   date('tanggal').notNull(),
  status:    sjStatusEnum('status').notNull().default('final'),
  catatan:   text('catatan'),
  tenantId:  text('tenant_id').notNull().default('STX-001'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => userProfile.id),
});


// =============================================================================
// TABEL: bundle
// =============================================================================

export const bundle = pgTable('bundle', {
  id:            uuid('id').primaryKey().defaultRandom(),
  barcode:       text('barcode').notNull().unique(),
  poId:          uuid('po_id').notNull().references(() => po.id),
  poItemId:      uuid('po_item_id').notNull().references(() => poItem.id),
  noUrut:        integer('no_urut').notNull(),
  noUrutPo:      integer('no_urut_po'),
  statusTahap:   jsonb('status_tahap').notNull().default(sql`'{}'::jsonb`),
  suratJalanId:  uuid('surat_jalan_id').references(() => suratJalan.id),
  tenantId:      text('tenant_id').notNull().default('STX-001'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:     uuid('created_by').references(() => userProfile.id),
},
(t) => [
  index('idx_bundle_barcode').on(t.barcode),
  index('idx_bundle_po_id').on(t.poId),
]);


// =============================================================================
// TABEL: bundle_sequence
// =============================================================================

export const bundleSequence = pgTable('bundle_sequence', {
  id:            uuid('id').primaryKey().defaultRandom(),
  tenantId:      text('tenant_id').notNull().unique().default('STX-001'),
  lastSequence:  integer('last_sequence').notNull().default(0),
});


// =============================================================================
// TABEL: scan_log
// =============================================================================

export const scanLog = pgTable('scan_log', {
  id:          uuid('id').primaryKey().defaultRandom(),
  bundleId:    uuid('bundle_id').notNull().references(() => bundle.id),
  tahap:       tahapProduksiEnum('tahap').notNull(),
  tipe:        scanTipeEnum('tipe').notNull(),
  qty:         integer('qty').notNull(),
  karyawanId:  uuid('karyawan_id').references(() => karyawan.id),
  userId:      uuid('user_id').notNull().references(() => userProfile.id),
  catatan:     text('catatan'),
  tenantId:    text('tenant_id').notNull().default('STX-001'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
},
(t) => [
  index('idx_scan_log_bundle').on(t.bundleId, t.tahap),
]);


// =============================================================================
// TABEL: inventory_item
// =============================================================================

export const inventoryItem = pgTable('inventory_item', {
  id:           uuid('id').primaryKey().defaultRandom(),
  nama:         text('nama').notNull(),
  satuan:       text('satuan').notNull(),
  stokAktual:   numeric('stok_aktual', { precision: 14, scale: 3 }).notNull().default('0'),
  stokMinimum:  numeric('stok_minimum', { precision: 14, scale: 3 }).notNull().default('0'),
  tenantId:     text('tenant_id').notNull().default('STX-001'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:    uuid('created_by').references(() => userProfile.id),
});


// =============================================================================
// TABEL: jurnal_entry (dideklarasikan sebelum inventory_batch karena inventory_batch FK ke sini)
// =============================================================================

export const jurnalEntry = pgTable('jurnal_entry', {
  id:               uuid('id').primaryKey().defaultRandom(),
  kategoriTrxId:    uuid('kategori_trx_id').notNull().references(() => kategoriTrx.id),
  jenis:            text('jenis').notNull(),  // CHECK di SQL migration
  nominal:          numeric('nominal', { precision: 16, scale: 2 }).notNull(),
  tanggal:          date('tanggal').notNull(),
  noFaktur:         text('no_faktur'),
  tagPoIds:         jsonb('tag_po_ids').notNull().default(sql`'[]'::jsonb`),
  keterangan:       text('keterangan').notNull(),
  detailUpah:       jsonb('detail_upah'),
  qty:              numeric('qty', { precision: 14, scale: 3 }),
  inventoryItemId:  uuid('inventory_item_id').references(() => inventoryItem.id),
  tenantId:         text('tenant_id').notNull().default('STX-001'),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:        uuid('created_by').references(() => userProfile.id),
},
(t) => [
  index('idx_jurnal_tanggal').on(t.tenantId, t.tanggal),
]);


// =============================================================================
// TABEL: inventory_batch
// =============================================================================

export const inventoryBatch = pgTable('inventory_batch', {
  id:               uuid('id').primaryKey().defaultRandom(),
  inventoryItemId:  uuid('inventory_item_id').notNull().references(() => inventoryItem.id),
  qtyAwal:          numeric('qty_awal', { precision: 14, scale: 3 }).notNull(),
  qtySisa:          numeric('qty_sisa', { precision: 14, scale: 3 }).notNull(),
  hargaSatuan:      numeric('harga_satuan', { precision: 14, scale: 2 }).notNull(),
  tanggalMasuk:     date('tanggal_masuk').notNull(),
  jurnalEntryId:    uuid('jurnal_entry_id').references(() => jurnalEntry.id),
  tenantId:         text('tenant_id').notNull().default('STX-001'),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
},
(t) => [
  index('idx_batch_fifo').on(t.inventoryItemId, t.tanggalMasuk),
]);


// =============================================================================
// TABEL: pemakaian_bahan
// =============================================================================

export const pemakaianBahan = pgTable('pemakaian_bahan', {
  id:               uuid('id').primaryKey().defaultRandom(),
  bundleId:         uuid('bundle_id').notNull().references(() => bundle.id),
  inventoryItemId:  uuid('inventory_item_id').notNull().references(() => inventoryItem.id),
  qtyPakai:         numeric('qty_pakai', { precision: 14, scale: 3 }).notNull(),
  inventoryBatchId: uuid('inventory_batch_id').notNull().references(() => inventoryBatch.id),
  tenantId:         text('tenant_id').notNull().default('STX-001'),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:        uuid('created_by').references(() => userProfile.id),
},
(t) => [
  uniqueIndex('unique_bundle_item').on(t.bundleId, t.inventoryItemId),
  index('idx_pemakaian_bundle').on(t.bundleId),
]);


// =============================================================================
// TABEL: koreksi_qty
// =============================================================================

export const koreksiQty = pgTable('koreksi_qty', {
  id:         uuid('id').primaryKey().defaultRandom(),
  bundleId:   uuid('bundle_id').notNull().references(() => bundle.id),
  tahap:      tahapProduksiEnum('tahap').notNull(),
  tipe:       koreksiTipeEnum('tipe').notNull(),
  qty:        integer('qty').notNull(),
  status:     koreksiStatusEnum('status').notNull().default('pending'),
  alasan:     text('alasan').notNull(),
  approvedBy: uuid('approved_by').references(() => userProfile.id),
  tenantId:   text('tenant_id').notNull().default('STX-001'),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:  uuid('created_by').references(() => userProfile.id),
});


// =============================================================================
// TABEL: gaji_ledger
// =============================================================================

export const gajiLedger = pgTable('gaji_ledger', {
  id:           uuid('id').primaryKey().defaultRandom(),
  karyawanId:   uuid('karyawan_id').notNull().references(() => karyawan.id),
  tipe:         gajiLedgerTipeEnum('tipe').notNull(),
  total:        numeric('total', { precision: 14, scale: 2 }).notNull(),
  tanggal:      date('tanggal').notNull(),
  sumberId:     text('sumber_id').notNull(),
  keterangan:   text('keterangan').notNull(),
  status:       gajiStatusEnum('status').notNull().default('belum_lunas'),
  tanggalBayar: timestamp('tanggal_bayar', { withTimezone: true }),
  isPrinted:    boolean('is_printed').notNull().default(false),
  tenantId:     text('tenant_id').notNull().default('STX-001'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:    uuid('created_by').references(() => userProfile.id),
},
(t) => [
  index('idx_gaji_ledger_karyawan').on(t.karyawanId, t.status),
]);


// =============================================================================
// TABEL: kasbon
// =============================================================================

export const kasbon = pgTable('kasbon', {
  id:         uuid('id').primaryKey().defaultRandom(),
  karyawanId: uuid('karyawan_id').notNull().references(() => karyawan.id),
  jumlah:     numeric('jumlah', { precision: 14, scale: 2 }).notNull(),
  tanggal:    date('tanggal').notNull(),
  keterangan: text('keterangan').notNull(),
  status:     kasbonStatusEnum('status').notNull().default('belum_lunas'),
  tenantId:   text('tenant_id').notNull().default('STX-001'),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:  uuid('created_by').references(() => userProfile.id),
},
(t) => [
  index('idx_kasbon_karyawan_status').on(t.karyawanId, t.status),
]);


// =============================================================================
// TABEL: surat_jalan_item
// =============================================================================

export const suratJalanItem = pgTable('surat_jalan_item', {
  id:        uuid('id').primaryKey().defaultRandom(),
  sjId:      uuid('sj_id').notNull().references(() => suratJalan.id, { onDelete: 'cascade' }),
  bundleId:  uuid('bundle_id').notNull().references(() => bundle.id).unique(),
  qtyKirim:  integer('qty_kirim').notNull(),
  tenantId:  text('tenant_id').notNull().default('STX-001'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});


// =============================================================================
// TABEL: sj_sequence
// =============================================================================

export const sjSequence = pgTable('sj_sequence', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tahun:        integer('tahun').notNull(),
  tenantId:     text('tenant_id').notNull().default('STX-001'),
  lastSequence: integer('last_sequence').notNull().default(0),
},
(t) => [
  uniqueIndex('unique_sj_sequence').on(t.tahun, t.tenantId),
]);


// =============================================================================
// TABEL: audit_log
// =============================================================================

export const auditLog = pgTable('audit_log', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => userProfile.id),
  modul:     text('modul').notNull(),
  aksi:      text('aksi').notNull(),
  target:    text('target'),
  metadata:  jsonb('metadata'),
  tenantId:  text('tenant_id').notNull().default('STX-001'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
},
(t) => [
  index('idx_audit_log_modul').on(t.tenantId, t.modul, t.createdAt),
]);


// =============================================================================
// RELATIONS
// =============================================================================

export const userProfileRelations = relations(userProfile, ({ many }) => ({
  karyawanCreated: many(karyawan),
  poCreated:       many(po),
  scanLogs:        many(scanLog),
  auditLogs:       many(auditLog),
  gajiLedgers:     many(gajiLedger),
}));

export const klienRelations = relations(klien, ({ many }) => ({
  pos:         many(po),
  suratJalans: many(suratJalan),
}));

export const poRelations = relations(po, ({ one, many }) => ({
  klien:   one(klien, { fields: [po.klienId], references: [klien.id] }),
  items:   many(poItem),
  bundles: many(bundle),
}));

export const poItemRelations = relations(poItem, ({ one, many }) => ({
  po:      one(po, { fields: [poItem.poId], references: [po.id] }),
  bundles: many(bundle),
}));

export const bundleRelations = relations(bundle, ({ one, many }) => ({
  po:          one(po,        { fields: [bundle.poId],       references: [po.id] }),
  poItem:      one(poItem,    { fields: [bundle.poItemId],   references: [poItem.id] }),
  suratJalan:  one(suratJalan,{ fields: [bundle.suratJalanId], references: [suratJalan.id] }),
  scanLogs:    many(scanLog),
  pemakaians:  many(pemakaianBahan),
  koreksis:    many(koreksiQty),
}));

export const scanLogRelations = relations(scanLog, ({ one }) => ({
  bundle:   one(bundle,      { fields: [scanLog.bundleId],   references: [bundle.id] }),
  karyawan: one(karyawan,    { fields: [scanLog.karyawanId], references: [karyawan.id] }),
  user:     one(userProfile, { fields: [scanLog.userId],     references: [userProfile.id] }),
}));

export const karyawanRelations = relations(karyawan, ({ many }) => ({
  scanLogs:    many(scanLog),
  gajiLedgers: many(gajiLedger),
  kasbons:     many(kasbon),
}));

export const inventoryItemRelations = relations(inventoryItem, ({ many }) => ({
  batches:    many(inventoryBatch),
  pemakaians: many(pemakaianBahan),
}));

export const inventoryBatchRelations = relations(inventoryBatch, ({ one, many }) => ({
  item:        one(inventoryItem, { fields: [inventoryBatch.inventoryItemId], references: [inventoryItem.id] }),
  jurnalEntry: one(jurnalEntry,   { fields: [inventoryBatch.jurnalEntryId],   references: [jurnalEntry.id] }),
  pemakaians:  many(pemakaianBahan),
}));

export const jurnalEntryRelations = relations(jurnalEntry, ({ one }) => ({
  kategoriTrx:   one(kategoriTrx,   { fields: [jurnalEntry.kategoriTrxId],   references: [kategoriTrx.id] }),
  inventoryItem: one(inventoryItem, { fields: [jurnalEntry.inventoryItemId], references: [inventoryItem.id] }),
}));

export const suratJalanRelations = relations(suratJalan, ({ one, many }) => ({
  klien:   one(klien,  { fields: [suratJalan.klienId], references: [klien.id] }),
  items:   many(suratJalanItem),
  bundles: many(bundle),
}));

export const suratJalanItemRelations = relations(suratJalanItem, ({ one }) => ({
  suratJalan: one(suratJalan, { fields: [suratJalanItem.sjId], references: [suratJalan.id] }),
  bundle:     one(bundle,     { fields: [suratJalanItem.bundleId], references: [bundle.id] }),
}));
