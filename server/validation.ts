import { z } from 'zod';
import { ORDER_STATUSES, type OrderStatus } from '../shared/types';
import { normalizeRecoveryCode } from './crypto';
import { HttpError } from './http';

const orderStatusTuple = [...ORDER_STATUSES] as [OrderStatus, ...OrderStatus[]];

export const mobileSchema = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number.');
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(72, 'Use no more than 72 characters.')
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/\d/, 'Include at least one number.');
export const recoveryCodeSchema = z
  .string()
  .transform(normalizeRecoveryCode)
  .refine((value) => /^ZZKD-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(value), 'Enter the recovery code exactly as shown.');
export const mediaPathSchema = z
  .string()
  .regex(/^\/media\/[A-Za-z0-9/_-]+\.webp$/, 'Only stored /media WebP image paths are allowed.')
  .refine((value) => !value.includes('..'), 'Invalid media path.');
export const modelPathSchema = z
  .string()
  .regex(/^\/media\/models\/[A-Za-z0-9/_-]+\.(glb|gltf)$/, 'Only stored /media GLB or glTF model paths are allowed.')
  .refine((value) => !value.includes('..'), 'Invalid model path.');
export const spinFrameCountSchema = z.union([
  z.literal(8), z.literal(12), z.literal(16), z.literal(24), z.literal(36),
]);
export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a six-digit hex colour.');
export const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens.');

export const registerSchema = z
  .object({
    mobile: mobileSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  mobile: mobileSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const forgotPasswordSchema = z
  .object({
    mobile: mobileSchema,
    recoveryCode: recoveryCodeSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const regenerateRecoverySchema = z.object({
  password: z.string().min(1, 'Enter your current password.'),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(80),
});

export const adminSetupSchema = z
  .object({
    bootstrapToken: z.string().trim().min(10, 'Enter the private setup token.'),
    username: z.string().trim().min(3).max(50).regex(/^[A-Za-z0-9_.-]+$/, 'Use letters, numbers, dots, hyphens or underscores.'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const adminLoginSchema = z.object({
  username: z.string().trim().min(1, 'Enter your administrator username.'),
  password: z.string().min(1, 'Enter your password.'),
});

export const addressSchema = z.object({
  label: z.string().trim().min(1).max(40).default('Home'),
  fullName: z.string().trim().min(2).max(80),
  mobile: mobileSchema,
  line1: z.string().trim().min(8, 'Enter the complete street address.').max(180),
  line2: z.string().trim().max(180).default(''),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code.'),
  isDefault: z.boolean().default(false),
});

export const checkoutSelectionSchema = z.object({
  productSlug: slugSchema,
  variantId: z.coerce.number().int().positive(),
  sizeId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(5),
});

export const wishlistSchema = z.object({
  productId: z.coerce.number().int().positive(),
});

export const orderCreateSchema = checkoutSelectionSchema.extend({
  customerName: z.string().trim().min(2).max(80),
  mobile: mobileSchema,
  line1: z.string().trim().min(8).max(180),
  line2: z.string().trim().max(180).default(''),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code.'),
  saveAddress: z.boolean().default(false),
});

export const newsletterSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(180),
});

export const statusUpdateSchema = z.object({
  status: z.enum(orderStatusTuple),
  note: z.string().trim().max(180).optional().default(''),
});

export const productFlagsSchema = z
  .object({
    featured: z.boolean().optional(),
    newArrival: z.boolean().optional(),
    bestSeller: z.boolean().optional(),
    available: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), 'Provide at least one flag.');

export const stockUpdateSchema = z.object({
  variantId: z.coerce.number().int().positive(),
  sizeId: z.coerce.number().int().positive(),
  stock: z.coerce.number().int().min(0).max(9999),
});

export const categoryFormSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: slugSchema.optional(),
  description: z.string().trim().max(300).default(''),
  imagePath: mediaPathSchema.nullable().optional(),
  specialFilter: z.enum(['new_arrival', 'best_seller']).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

const existingImageSchema = z.object({
  id: z.coerce.number().int().positive(),
  path: mediaPathSchema,
  thumbPath: mediaPathSchema,
});

const existingSpinImageSchema = z.object({
  id: z.coerce.number().int().positive(),
  path: mediaPathSchema,
  thumbPath: mediaPathSchema,
});

export const productSpinSchema = z.object({
  frameCount: spinFrameCountSchema,
  existingImages: z.array(existingSpinImageSchema).max(36).default([]),
  existingModelPath: modelPathSchema.nullable().optional(),
  removeModel: z.boolean().default(false),
  clearSequence: z.boolean().default(false),
});

export const productFormSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    name: z.string().trim().min(2).max(120),
    slug: slugSchema.optional(),
    description: z.string().trim().min(10).max(3000),
    categoryId: z.coerce.number().int().positive().nullable(),
    pricePaise: z.coerce.number().int().min(100).max(100_000_000),
    originalPricePaise: z.coerce.number().int().min(100).max(100_000_000),
    available: z.boolean().default(true),
    featured: z.boolean().default(false),
    newArrival: z.boolean().default(false),
    bestSeller: z.boolean().default(false),
    sizes: z
      .array(z.object({ id: z.coerce.number().int().positive().optional(), label: z.string().trim().min(1).max(24) }))
      .min(1)
      .max(12),
    variants: z
      .array(
        z.object({
          id: z.coerce.number().int().positive().optional(),
          name: z.string().trim().min(1).max(50),
          colorHex: hexColorSchema,
          existingImages: z.array(existingImageSchema).max(8).default([]),
          stock: z.array(z.coerce.number().int().min(0).max(9999)).min(1).max(12),
          spin: productSpinSchema.optional(),
        }),
      )
      .min(1)
      .max(8),
  })
  .superRefine((data, ctx) => {
    if (data.originalPricePaise < data.pricePaise) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['originalPricePaise'], message: 'Original price must be at least the selling price.' });
    }
    data.variants.forEach((variant, index) => {
      if (variant.stock.length !== data.sizes.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants', index, 'stock'],
          message: 'Enter stock for every size.',
        });
      }
    });
  });

export const productQuerySchema = z.object({
  category: slugSchema.optional(),
  collection: z.enum(['featured', 'new', 'best']).optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(['editorial', 'newest', 'price-low', 'price-high', 'discount', 'name']).default('editorial'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});

export const adminProductQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.coerce.number().int().positive().optional(),
  stock: z.enum(['all', 'low', 'out']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const adminOrderQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(orderStatusTuple).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const adminCustomerQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export function parseJsonField<T extends z.ZodTypeAny>(raw: unknown, schema: T): z.infer<T> {
  if (typeof raw === 'string') {
    return schema.parse(JSON.parse(raw));
  }
  return schema.parse(raw);
}

export function parseIdParam(value: string, label = 'ID'): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, `Invalid ${label}.`, 'invalid_id');
  }
  return parsed;
}
