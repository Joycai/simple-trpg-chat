import { describe, expect, it } from 'vitest';
import { describeAsset, assetIdFromUrl, Submission } from '../types';
describe('asset authoring input', () => {
  it('preserves explicitly filled zero but omits missing attributes', () => {
    expect(describeAsset([['Name', ' Investigator '], ['Age', undefined], ['Strength', null], ['Resource', 0]])).toBe('Name: Investigator\nResource: 0');
  });
  it('bounds profile text and rejects an empty generation prompt', () => {
    expect(describeAsset([['Bio', 'a'.repeat(10000)]])).toHaveLength(7000);
    expect(Submission.safeParse({ prompt: ' ' }).success).toBe(false);
  });
  it('accepts only canonical same-origin asset references', () => {
    expect(assetIdFromUrl('/api/assets/00000000-0000-4000-8000-000000000000')).toBeTruthy();
    expect(assetIdFromUrl('https://other/api/assets/00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(assetIdFromUrl('/api/assets/../../secret')).toBeNull();
  });
});
