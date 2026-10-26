import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';

export function useCatalog() {
  return useQuery({ queryKey: ['catalog'], queryFn: api.catalog });
}

export function syncedLabel(updatedAt: number): string {
  if (!updatedAt) return '';
  const mins = Math.floor((Date.now() - updatedAt) / 60_000);
  if (mins < 1) return 'Synced just now';
  if (mins < 60) return `Synced ${mins} min ago`;
  return `Synced ${Math.floor(mins / 60)} h ago`;
}
