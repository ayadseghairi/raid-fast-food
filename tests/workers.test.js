/**
 * Tests for workers and worker_payments (Item 6).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import migration001 from '../electron/db/migrations/001_init.js';
import migration002 from '../electron/db/migrations/002_size_price_mode.js';
import migration003 from '../electron/db/migrations/003_workers.js';
import { setDb } from '../electron/db/connection.js';

const _db = new Database(':memory:');
_db.pragma('foreign_keys = ON');
migration001.up(_db);
migration002.up(_db);
migration003.up(_db);
setDb(_db);

const workersRepo = await import('../electron/repositories/workers.js');
const workersSvc  = await import('../electron/services/workers.js');

function clearAll() {
  _db.exec(`
    DELETE FROM worker_payments; DELETE FROM workers;
    DELETE FROM sqlite_sequence WHERE name IN ('worker_payments','workers');
  `);
}

describe('workers repository', () => {
  beforeEach(() => clearAll());

  it('creates and lists workers', () => {
    workersRepo.createWorker('أحمد');
    workersRepo.createWorker('محمد');
    const list = workersRepo.listWorkers();
    expect(list).toHaveLength(2);
  });

  it('lists active-only workers', () => {
    const w1 = workersRepo.createWorker('أحمد');
    const w2 = workersRepo.createWorker('علي');
    workersRepo.setWorkerActive(w2.id, false);
    expect(workersRepo.listWorkers(true)).toHaveLength(1);
    expect(workersRepo.listWorkers(true)[0].id).toBe(w1.id);
  });

  it('updates worker name', () => {
    const w = workersRepo.createWorker('قديم');
    workersRepo.updateWorker(w.id, 'جديد');
    expect(workersRepo.getWorkerById(w.id).name).toBe('جديد');
  });
});

describe('worker_payments repository', () => {
  let w1Id, w2Id;

  beforeEach(() => {
    clearAll();
    w1Id = workersRepo.createWorker('أحمد').id;
    w2Id = workersRepo.createWorker('علي').id;
  });

  it('upserts a payment and retrieves it', () => {
    workersRepo.upsertPayment(w1Id, '2025-06-10', 5000);
    const entry = workersRepo.getPaymentsForDate('2025-06-10');
    const row = entry.find(e => e.worker_id === w1Id);
    expect(row.amount).toBe(5000);
  });

  it('editing overwrites the previous amount', () => {
    workersRepo.upsertPayment(w1Id, '2025-06-10', 5000);
    workersRepo.upsertPayment(w1Id, '2025-06-10', 8000);
    const entry = workersRepo.getPaymentsForDate('2025-06-10');
    expect(entry.find(e => e.worker_id === w1Id).amount).toBe(8000);
  });

  it('zero amount is valid', () => {
    workersRepo.upsertPayment(w1Id, '2025-06-10', 0);
    const entry = workersRepo.getPaymentsForDate('2025-06-10');
    expect(entry.find(e => e.worker_id === w1Id).amount).toBe(0);
  });

  it('UNIQUE constraint enforced by upsert (not duplicate)', () => {
    workersRepo.upsertPayment(w1Id, '2025-06-10', 3000);
    workersRepo.upsertPayment(w1Id, '2025-06-10', 6000);
    // Should not have duplicates
    const all = _db.prepare('SELECT * FROM worker_payments WHERE worker_id=? AND date=?').all(w1Id, '2025-06-10');
    expect(all).toHaveLength(1);
    expect(all[0].amount).toBe(6000);
  });

  it('savePaymentsForDate saves all workers', () => {
    workersRepo.savePaymentsForDate('2025-06-11', [
      { worker_id: w1Id, amount: 4000 },
      { worker_id: w2Id, amount: 2500 },
    ]);
    const entry = workersRepo.getPaymentsForDate('2025-06-11');
    expect(entry.find(e => e.worker_id === w1Id).amount).toBe(4000);
    expect(entry.find(e => e.worker_id === w2Id).amount).toBe(2500);
  });

  it('workers with no payment for date get amount=0', () => {
    // w1 has no payment for this date
    const entry = workersRepo.getPaymentsForDate('2025-07-01');
    const row = entry.find(e => e.worker_id === w1Id);
    expect(row.amount).toBe(0);
    expect(row.payment_id).toBe(null);
  });

  it('deactivated workers are hidden from daily entry', () => {
    workersRepo.setWorkerActive(w2Id, false);
    const entry = workersRepo.getPaymentsForDate('2025-06-10');
    expect(entry.find(e => e.worker_id === w2Id)).toBeUndefined();
    expect(entry.find(e => e.worker_id === w1Id)).toBeDefined();
  });
});

describe('worker payments totals', () => {
  let w1Id;

  beforeEach(() => {
    clearAll();
    w1Id = workersRepo.createWorker('أحمد').id;
  });

  it('totalPayForRange sums amounts in range', () => {
    workersRepo.upsertPayment(w1Id, '2025-06-10', 3000);
    workersRepo.upsertPayment(w1Id, '2025-06-11', 4000);
    workersRepo.upsertPayment(w1Id, '2025-07-01', 5000); // outside range
    const total = workersRepo.totalPayForRange('2025-06-01', '2025-06-30');
    expect(total).toBe(7000);
  });

  it('workerSummaryForRange shows per-worker totals', () => {
    const w2Id = workersRepo.createWorker('علي').id;
    workersRepo.upsertPayment(w1Id, '2025-06-10', 3000);
    workersRepo.upsertPayment(w1Id, '2025-06-11', 4000);
    workersRepo.upsertPayment(w2Id, '2025-06-10', 2000);

    const summary = workersRepo.workerSummaryForRange('2025-06-01', '2025-06-30');
    const row1 = summary.find(r => r.id === w1Id);
    const row2 = summary.find(r => r.id === w2Id);
    expect(row1.days_paid).toBe(2);
    expect(row1.total_paid).toBe(7000);
    expect(row2.total_paid).toBe(2000);
  });
});

describe('workers service validation', () => {
  beforeEach(() => clearAll());

  it('rejects empty worker name', () => {
    expect(() => workersSvc.createWorker('')).toThrow('اسم العامل مطلوب');
    expect(() => workersSvc.createWorker('  ')).toThrow('اسم العامل مطلوب');
  });

  it('rejects non-existent worker update', () => {
    expect(() => workersSvc.updateWorker(9999, 'اسم')).toThrow('العامل غير موجود');
  });

  it('rejects negative amount in saveDailyPayments', () => {
    const w = workersRepo.createWorker('أحمد');
    expect(() =>
      workersSvc.saveDailyPayments('2025-06-10', [{ worker_id: w.id, amount: -100 }])
    ).toThrow();
  });
});
