import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { api, ApiError } from './client';
import type { Cart, Dictionaries } from './types';

export function useDictionaries() {
  return useQuery({ queryKey: ['dictionaries'], queryFn: () => api.get<Dictionaries>('/dictionaries'), staleTime: 60_000 });
}

export function useCart(enabled = true) {
  return useQuery({ queryKey: ['cart'], queryFn: () => api.get<Cart>('/cart'), enabled });
}

/** Действия с корзиной. Ответ сервера — актуальная корзина, кладём её прямо в кэш. */
export function useCartActions() {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const onSuccess = (cart: Cart) => {
    qc.setQueryData(['cart'], cart);
    qc.invalidateQueries({ queryKey: ['parts'] });
  };
  const onError = (e: unknown) => message.error((e as ApiError).message);

  const add = useMutation({
    mutationFn: ({ partId, quantity }: { partId: number; quantity: number }) => api.post<Cart>('/cart/items', { partId, quantity }),
    onSuccess,
    onError,
  });
  const set = useMutation({
    mutationFn: ({ partId, quantity }: { partId: number; quantity: number }) => api.put<Cart>(`/cart/items/${partId}`, { quantity }),
    onSuccess,
    onError,
  });
  const remove = useMutation({
    mutationFn: (partId: number) => api.del<Cart>(`/cart/items/${partId}`),
    onSuccess,
    onError,
  });
  return { add, set, remove };
}
