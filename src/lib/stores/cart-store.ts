import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartCustomization {
  group_id: string;
  group_name: string;
  options: {
    id: string;
    name: string;
    price: number;
  }[];
}

export interface CartItem {
  id: string; // unique cart item id
  item_id: string;
  name: string;
  image_url: string | null;
  base_price: number;
  quantity: number;
  customizations: CartCustomization[];
  total_price: number; // (base_price + customization prices) * quantity
}

interface CartState {
  items: CartItem[];
  outlet_id: string | null;
  coupon_code: string | null;
  coupon_discount: number;
  notes: string;

  // Actions
  addItem: (item: Omit<CartItem, "id">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  setOutlet: (outlet_id: string) => void;
  setCoupon: (code: string | null, discount: number) => void;
  setNotes: (notes: string) => void;

  // Computed
  getSubtotal: () => number;
  getItemCount: () => number;
}

function generateCartItemId(): string {
  return `cart_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function calculateItemTotal(item: Omit<CartItem, "id" | "total_price">): number {
  const customizationTotal = item.customizations.reduce(
    (sum, group) => sum + group.options.reduce((s, o) => s + o.price, 0),
    0
  );
  return (item.base_price + customizationTotal) * item.quantity;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      outlet_id: null,
      coupon_code: null,
      coupon_discount: 0,
      notes: "",

      addItem: (item) => {
        const id = generateCartItemId();
        const total_price = calculateItemTotal(item);
        set((state) => ({
          items: [...state.items, { ...item, id, total_price }],
        }));
      },

      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        }));
      },

      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(id);
          return;
        }
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  quantity,
                  total_price: calculateItemTotal({ ...item, quantity }),
                }
              : item
          ),
        }));
      },

      clearCart: () => {
        set({
          items: [],
          coupon_code: null,
          coupon_discount: 0,
          notes: "",
        });
      },

      setOutlet: (outlet_id) => {
        const current = get().outlet_id;
        if (current && current !== outlet_id) {
          // Changing outlets clears cart
          set({ items: [], outlet_id, coupon_code: null, coupon_discount: 0, notes: "" });
        } else {
          set({ outlet_id });
        }
      },

      setCoupon: (code, discount) => {
        set({ coupon_code: code, coupon_discount: discount });
      },

      setNotes: (notes) => {
        set({ notes });
      },

      getSubtotal: () => {
        return get().items.reduce((sum, item) => sum + item.total_price, 0);
      },

      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },
    }),
    {
      name: "pnut-cart",
    }
  )
);
