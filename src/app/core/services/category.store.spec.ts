import { TestBed } from '@angular/core/testing';
import { CategoryStore } from './category.store';

describe('CategoryStore', () => {
  beforeEach(() => { localStorage.clear(); TestBed.resetTestingModule(); });

  it('adds normalized unique categories', () => {
    const store = TestBed.inject(CategoryStore);
    expect(store.add('  Tax   records ')).toBe(true);
    expect(store.custom()).toEqual(['Tax records']);
    expect(store.add('tax records')).toBe(false);
  });

  it('removes custom categories', () => {
    const store = TestBed.inject(CategoryStore);
    store.add('Warranty');
    store.remove('Warranty');
    expect(store.custom()).toEqual([]);
  });
});
