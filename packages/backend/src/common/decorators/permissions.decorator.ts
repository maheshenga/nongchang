import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@nongchang/shared';

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
