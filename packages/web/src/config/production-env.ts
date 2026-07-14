export interface ProductionWebEnv {
  VITE_PUBLIC_SALES_CONTACT?: string | null;
}

export function resolveProductionWebEnv(env: ProductionWebEnv): { salesContact: string } {
  const salesContact = env.VITE_PUBLIC_SALES_CONTACT?.trim() ?? '';
  if (!salesContact || salesContact.toLowerCase() === 'undefined') {
    throw new Error('VITE_PUBLIC_SALES_CONTACT is required for a production Web build');
  }
  return { salesContact };
}
