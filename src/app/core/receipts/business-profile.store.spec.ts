import { TestBed } from '@angular/core/testing';
import { BusinessProfileStore, RECEIPT_ACCENTS } from './business-profile.store';

describe('BusinessProfileStore', () => {
  beforeEach(() => { localStorage.clear(); TestBed.resetTestingModule(); });

  it('clears the business details and receipt numbering', () => {
    const store = TestBed.inject(BusinessProfileStore);
    store.save({ name: 'Aling Nena Store', details: '123 Rizal St.', accent: RECEIPT_ACCENTS[2] });
    store.recordNumber('0042');

    store.clear();

    expect(store.profile()).toEqual({ name: '', details: '', accent: RECEIPT_ACCENTS[0] });
    expect(localStorage.getItem('snapsort.business.v1')).toBeNull();
    expect(localStorage.getItem('snapsort.receiptNumber')).toBeNull();
  });
});
