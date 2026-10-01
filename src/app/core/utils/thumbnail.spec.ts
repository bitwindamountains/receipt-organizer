import { thumbKeyFor, thumbnailSize } from './thumbnail';

describe('thumbnails', () => {
  it('derives a jpg key in the thumbs folder', () => {
    expect(thumbKeyFor('images/abc-123.png')).toBe('thumbs/abc-123.jpg');
    expect(thumbKeyFor('images/abc.jpeg')).toBe('thumbs/abc.jpg');
  });

  it('scales the shorter edge down and keeps the aspect ratio', () => {
    expect(thumbnailSize(4000, 3000)).toEqual({ width: 640, height: 480 });
    expect(thumbnailSize(1080, 2400)).toEqual({ width: 480, height: 1067 });
  });

  it('never upscales small images', () => {
    expect(thumbnailSize(300, 200)).toEqual({ width: 300, height: 200 });
  });
});
