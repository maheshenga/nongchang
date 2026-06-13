export interface TraceRecord {
  id: string;
  qrCode: string;
  action: string;
  worker: string;
  time: string;
  location: string;
  imageUrl?: string;
  notes?: string;
}

export interface Crop {
  id: string;
  name: string;
  batchNo: string;
  plantDate: string;
  expectedHarvest: string;
  qrCodesGenerated: number;
  status: 'Planting' | 'Growing' | 'Harvested' | 'Distributed';
}

export interface Agent {
  id: string;
  name: string;
  level: string;
  parent?: string;
  region: string;
  sales: number;
  status: 'Active' | 'Pending' | 'Inactive';
}
