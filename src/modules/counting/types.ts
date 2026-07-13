export type CountingWorkspaceStatus =
  | "draft"
  | "in-progress"
  | "completed"
  | "discarded";

export interface CountingLocationEntry {
  locationId: string;
  locationLabel: string;
  systemQuantity: number | null; // Can be null if missing in Product Master
  countedQuantity: number | null; // null means not counted yet (blank)
  difference: number | null; // null if not counted yet, otherwise countedQuantity - systemQuantity
}

export interface CountingItem {
  itemNumber: string;
  description: string;
  baseUnit?: string;
  placementNumber?: string;
  locations: CountingLocationEntry[];
  blocked?: boolean;
}

export interface CountingWorkspace {
  id: string;
  title: string;
  reason: string;
  customReason?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  status: CountingWorkspaceStatus;
  sourceProductMasterVersion?: string;
  items: CountingItem[];
  pdfSaved: boolean;
  pdfSavedAt?: string;
  isDirty: boolean;
}
