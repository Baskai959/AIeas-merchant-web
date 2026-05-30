import http from './http/client';

export type ItemStatus =
  | 'DRAFT'
  | 'PENDING_AUDIT'
  | 'READY'
  | 'REJECTED'
  | 'LISTED'
  | 'OFFLINE';
export type ItemConditionGrade = 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR';

export interface ItemCreateRequest {
  title: string;
  category: string;
  brand?: string;
  conditionGrade?: ItemConditionGrade;
  images?: File[];
  description?: string;
  status?: ItemStatus;
}

export interface ItemPatchRequest {
  title?: string;
  category?: string;
  brand?: string;
  conditionGrade?: ItemConditionGrade;
  images?: File[];
  description?: string;
  status?: ItemStatus;
}

export interface Item {
  id: number | string;
  sellerId: string;
  title: string;
  category: string;
  brand?: string;
  conditionGrade: ItemConditionGrade;
  images: string[];
  description?: string;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ListItemsParams {
  sellerId?: string;
  category?: string;
  status?: ItemStatus;
  limit?: number;
  offset?: number;
}

export interface ListItemsResult {
  items: Item[];
}

export interface ItemDescriptionGenerateRequest {
  title: string;
  category: string;
  condition: string;
  image?: File;
  imageUrl?: string;
}

export interface ItemDescriptionGenerateResult {
  title: string;
  category: string;
  description: string;
}

const ITEM_DESCRIPTION_GENERATE_TIMEOUT_MS = 30000;

function buildItemFormData(payload: ItemCreateRequest | ItemPatchRequest) {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (key === 'images') {
      (value as File[]).forEach((file) => {
        formData.append('images', file);
      });
      return;
    }
    formData.append(key, String(value));
  });
  return formData;
}

export function createItem(payload: ItemCreateRequest) {
  return http.post<any, Item>('/api/v1/items', buildItemFormData(payload));
}

export function listItems(params: ListItemsParams) {
  return http.get<any, ListItemsResult>('/api/v1/items', {
    params,
  });
}

export function fetchItem(id: string | number) {
  return http.get<any, Item>(`/api/v1/items/${id}`);
}

export function updateItem(id: string | number, payload: ItemPatchRequest) {
  return http.patch<any, Item>(
    `/api/v1/items/${id}`,
    buildItemFormData(payload)
  );
}

export function generateItemDescription(
  payload: ItemDescriptionGenerateRequest
) {
  const formData = new FormData();
  if (payload.image) {
    formData.append('image', payload.image);
  }
  if (payload.imageUrl) {
    formData.append('imageUrl', payload.imageUrl);
  }
  formData.append('title', payload.title);
  formData.append('category', payload.category);
  formData.append('condition', payload.condition);
  return http.post<any, ItemDescriptionGenerateResult>(
    '/api/v1/items/description/optimize',
    formData,
    {
      timeout: ITEM_DESCRIPTION_GENERATE_TIMEOUT_MS,
    }
  );
}
