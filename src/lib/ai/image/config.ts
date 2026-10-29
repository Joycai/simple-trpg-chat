import { z } from 'zod';

export const IMAGE_PROTOCOLS = ['openai-images', 'gemini', 'seedream', 'dashscope'] as const;
export type ImageProtocol = typeof IMAGE_PROTOCOLS[number];
interface ImageModel { id: string; label: string; model: string; protocols: readonly ImageProtocol[]; sizes: readonly string[]; endpoint: string }
const openai = { protocols: ['openai-images'] as const, sizes: ['1024x1024', '1536x1024', '1024x1536'], endpoint: 'https://api.openai.com/v1' };
const gemini = { protocols: ['gemini', 'openai-images'] as const, sizes: ['1K', '2K', '4K'], endpoint: 'https://generativelanguage.googleapis.com/v1beta' };
const seedream = { protocols: ['seedream'] as const, sizes: ['1K', '1.5K', '2K'], endpoint: 'https://ark.cn-beijing.volces.com/api/v3' };
const dashscope = { protocols: ['dashscope', 'openai-images'] as const, sizes: ['1024x1024', '2048x2048'], endpoint: 'https://dashscope.aliyuncs.com/api/v1' };
/** Protocol alternatives are explicit gateway contracts, never automatic fallbacks. */
export const IMAGE_MODELS: readonly ImageModel[] = [
  { id: 'gpt-image-2', label: 'GPT-Image 2', model: 'gpt-image-2', ...openai },
  { id: 'gpt-image-2.5-sunburst', label: 'GPT-Image 2.5 Sunburst', model: 'gpt-image-2.5-sunburst', ...openai },
  { id: 'gpt-image-2.5-flare', label: 'GPT-Image 2.5 Flare', model: 'gpt-image-2.5-flare', ...openai },
  { id: 'nano-banana-2', label: 'Gemini Image · Nano Banana 2', model: 'gemini-3.1-flash-image', ...gemini },
  { id: 'nano-banana-2.1', label: 'Gemini Image · Nano Banana 2.1', model: 'gemini-nano-banana-2.1', ...gemini },
  { id: 'nano-banana-pro', label: 'Gemini Image · Nano Banana Pro', model: 'gemini-3-pro-image', ...gemini },
  { id: 'doubao-seedream-5.0-pro', label: 'doubao-seedream-5.0-pro', model: 'doubao-seedream-5-0-pro-260628', ...seedream },
  { id: 'doubao-seedream-5.0-flash', label: 'doubao-seedream-5.0-flash', model: 'doubao-seedream-5-0-flash-260915', ...seedream },
  { id: 'wan2.7-image-pro', label: 'wan2.7-image-pro', model: 'wan2.7-image-pro', ...dashscope, sizes: ['1024x1024', '2048x2048', '4096x4096'] },
  { id: 'qwen-image-3.0', label: 'qwen-image-3.0', model: 'qwen-image-3.0', ...dashscope },
  { id: 'qwen-image-2.1-pro', label: 'qwen-image-2.1-pro', model: 'qwen-image-2.1-pro', ...dashscope },
];
export function imageModel(id: string) { return IMAGE_MODELS.find(m => m.id === id); }
export function imageSizes(id: string, protocol: ImageProtocol) {
  return protocol === 'openai-images' ? openai.sizes : imageModel(id)?.sizes ?? [];
}
export const ImageProviderInput = z.object({
  name: z.string().trim().min(1).max(100),
  modelType: z.string().refine(id => !!imageModel(id)),
  model: z.string().trim().min(1).max(200).regex(/^[a-zA-Z0-9._:/-]+$/),
  protocol: z.enum(IMAGE_PROTOCOLS),
  apiEndpoint: z.url().max(2048).refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  }),
  apiKey: z.string().trim().max(4096).optional(),
  size: z.string(),
  quality: z.enum(['auto', 'low', 'medium', 'high']).default('auto'),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).default('1:1'),
  watermark: z.boolean().default(false),
  ratePerImage: z.number().finite().min(0).max(1000000),
  isShared: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (!imageModel(value.modelType)?.protocols.includes(value.protocol)) ctx.addIssue({ code: 'custom', path: ['protocol'], message: 'Unsupported protocol' });
  if (!imageSizes(value.modelType, value.protocol).includes(value.size)) ctx.addIssue({ code: 'custom', path: ['size'], message: 'Unsupported size' });
});
export type ImageProviderData = z.infer<typeof ImageProviderInput>;
export type ImageProviderView = Omit<ImageProviderData, 'apiKey'> & { id: number; isOwner: boolean; apiKeyHint: string };
export const ImagePromptInput = z.object({ prompt: z.string().trim().min(1).max(8000) });
