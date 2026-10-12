import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { SavedItem } from '../models/saved-item';
import { ItemStore } from '../services/item.store';
import { CaptureService } from './capture.service';
import { CapturedNotification } from './transaction-parser';

const note = (id: string, text: string): CapturedNotification => ({ id, packageName: 'com.globe.gcash.android', title: 'GCash', text, postedAt: Date.now() });

describe('CaptureService.importNotifications', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    const existing = { id: 'old', notes: 'Ref. 1111111111' } as SavedItem;
    TestBed.configureTestingModule({
      providers: [
        { provide: ItemStore, useValue: { items: signal([existing]), load: () => Promise.resolve(), create: () => Promise.reject(new Error('disk full')) } },
        { provide: Router, useValue: {} },
        { provide: ToastController, useValue: {} },
      ],
    });
  });

  it('reports saved, duplicate, and non-payment notifications as handled, but not failed saves', async () => {
    const capture = TestBed.inject(CaptureService);
    const handled = await capture.importNotifications([
      note('duplicate', 'You have paid PHP 100.00 to MERALCO. Ref. No. 1111111111.'),
      note('promo', 'Get ₱50 cashback when you pay bills this weekend!'),
      note('failed', 'You have paid PHP 200.00 to PLDT. Ref. No. 2222222222.'),
    ]);
    expect([...handled].sort()).toEqual(['duplicate', 'promo']);
  });
});
