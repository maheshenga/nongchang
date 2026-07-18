import { describe, expect, it, vi } from 'vitest';
import { uploadImage } from './uploads';
import { request } from './request';

vi.mock('./request', () => ({
  request: vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/ai-diagnose/leaf.jpg' }),
}));

describe('upload API', () => {
  it('sends an explicit upload purpose', async () => {
    const file = new File(['image'], 'leaf.jpg', { type: 'image/jpeg' });

    await uploadImage(file, 'ai-diagnose');

    expect(request).toHaveBeenCalledWith('/uploads?purpose=ai-diagnose', {
      method: 'POST',
      body: expect.any(FormData),
    });
  });
});
