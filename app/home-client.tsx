"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, RefObject } from "react";
import Image from "next/image";
import { compareProductRatings, type CustomerReview } from "@/lib/reviews/types";
import Link from "next/link";
import type { Product } from "@/lib/storefront-catalog";
import { Apple, ArrowRight, Bike, ChevronDown, ChevronLeft, ChevronRight, Clock, Filter, Loader2, LogOut, MapPin, Package, PackageCheck, Play, Search, Settings, ShoppingCart, Store, User, Wrench, X, Zap } from "lucide-react";

import type {
  Address,
  CartLine,
  Order,
  OrderEventEntry,
  OrderStatus,
  PersistedView,
  RazorpayCheckoutOptions,
  RazorpayPaymentResponse,
  ShippingProviderName,
} from "./home/types";
import {
  CART_STORAGE_KEY,
  RECENT_SEARCHES_STORAGE_KEY,
  MAX_RECENT_SEARCHES,
  VIEW_STORAGE_KEY,
  addressIcons,
  bikeHotspots,
  brandCarouselOrder,
  brandModels,
  brands,
  carouselBrands,
  categories,
  footerCities,
  footerSocialLinks,
  headerCategories,
  categoryPartTypes,
  homeCategoryFilters,
  initialAddresses,
  initialCarouselBrandIndex,
  orderStatusFilters,
  orderStatusHeadline,
  orderStatusMeta,
  orderTrackingSteps,
  partCategories,
  priceFilterOptions,
  searchPlaceholders,
  sortOptions,
  stepIndexForStatus,
  WAREHOUSE_CITY,
  years,
  type SortOption,
} from "./home/constants";
import {
  computeExpectedDeliveryLabel,
  formatAddressLines,
  formatPrice,
  getAddressIcon,
  getProductDisplayMeta,
  loadRazorpayCheckout,
  mapDbOrderStatus,
  mapDbPartialRefundStatus,
  mapDbPartialReturnStatus,
  mapDbRefundStatus,
  mapDbReturnStatus,
  parsePrice,
} from "./home/utils";
import { BrandLogo, BrandSelectionModal, ModelSelectionModal, BikePartsModal } from "./home/BrandModals";
import { ProductCard, ProductCardSkeleton, ProductDetailDrawer } from "./home/ProductComponents";
import { CartDrawer, LoginModal } from "./home/CartAndLogin";
import { AddressMapPicker, AddressFormModal, AddressPanel } from "./home/AddressComponents";
import {
  OrderMiniTracker,
  OrderListRow,
  OrdersListPage,
  OrderDetailView,
} from "./home/OrderComponents";
import { SocialIcon, AccountMenu } from "./home/LayoutComponents";
import { CatalogView } from "./home/CatalogView";

export function HomeClient({ products }: { products: Product[] }) {
  const findProduct = (name: string) => products.find((item) => item.name === name);

  // "Best Sellers" / "New Arrivals" — top-rated and newest-first slices of
  // the real catalog (getStorefrontProducts already orders `products` newest
  // first). Previously a hand-curated list of names from the old 64-item
  // static catalog, which no longer lines up with the admin-managed one.
  const bestSellerProducts = useMemo(
    () =>
      [...products]
        .sort(compareProductRatings)
        .slice(0, 10),
    [products]
  );
  const newArrivalProducts = useMemo(() => products.slice(0, 10), [products]);

  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState("2024");
  // Remembers the last bike the user actually finished selecting, kept even
  // after handleGoHome clears selectedBrand/selectedModel back to the
  // landing page — so a navbar category click can jump straight back into
  // that bike's catalog instead of forcing the brand/model picker again.
  const [lastBikeSelection, setLastBikeSelection] = useState<{
    brand: string;
    model: string;
    year: string;
  } | null>(null);
  // True while browsing a homepage category with no bike selected (and none
  // remembered) — shows CatalogView in a bike-agnostic "all brands" mode
  // instead of forcing a bike pick just to look at a category.
  const [isBrowsingAllBikes, setIsBrowsingAllBikes] = useState(false);
  const [activeCategory, setActiveCategory] = useState("");
  const [isPartsModalOpen, setIsPartsModalOpen] = useState(false);
  const [showPartsHint, setShowPartsHint] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<
    Product | null
  >(null);
  useEffect(() => {
    if (!selectedProduct) return;
    // Wait for the details view and any closing overlay's scroll cleanup.
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedProduct]);
  const [cart, setCart] = useState<Record<string, number>>({});
  // Live remaining stock per product id, from /api/products/stock — the
  // real enforcement happens server-side at checkout (see reserveStock in
  // lib/checkout-stock.ts); this is just so the cart can warn/clamp before
  // the customer gets all the way to payment. Undefined for an id means
  // "haven't loaded stock yet" — treated as unlimited so the UI doesn't
  // block adding to cart while the fetch is still in flight.
  const [stockById, setStockById] = useState<Record<string, number>>({});
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  // UI auth state is restored from the server-side HttpOnly session after
  // mount. The browser never persists or supplies the phone as proof of
  // authentication.
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [authPhone, setAuthPhone] = useState<string | null>(null);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>(initialAddresses);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    initialAddresses[0]?.id ?? null
  );
  const [isAddressPanelOpen, setIsAddressPanelOpen] = useState(false);
  const [addressPanelMode, setAddressPanelMode] = useState<"checkout" | "manage">(
    "manage"
  );
  const [isAddressFormOpen, setIsAddressFormOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isOrdersPanelOpen, setIsOrdersPanelOpen] = useState(false);
  const [viewedOrderId, setViewedOrderId] = useState<string | null>(null);
  const viewedOrder = orders.find((order) => order.id === viewedOrderId) ?? null;
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  // Header search dropdown: recent searches (persisted) when the box is
  // focused and empty, live matching product names once something's typed.
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  // Which header category's "related parts" dropdown is open, if any —
  // only one at a time.
  const [openCategoryDropdown, setOpenCategoryDropdown] = useState<string | null>(null);
  const [categoryDropdownPos, setCategoryDropdownPos] = useState({ top: 0, left: 0 });
  const bestSellerScrollerRef = useRef<HTMLDivElement | null>(null);
  const newArrivalScrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeBrandSlide, setActiveBrandSlide] = useState(initialCarouselBrandIndex);

  const isAnyOverlayOpen =
    isBrandModalOpen ||
    isModelModalOpen ||
    isPartsModalOpen ||
    isCartOpen ||
    isLoginModalOpen ||
    isAccountMenuOpen ||
    isAddressPanelOpen ||
    isAddressFormOpen;

  // Locks background scroll while any modal/drawer is open — without this,
  // the page behind a "fixed" overlay can still scroll on mobile browsers.
  useEffect(() => {
    if (!isAnyOverlayOpen) {
      return;
    }

    const scrollY = window.scrollY;
    const { body } = document;
    const previousStyle = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      body.style.position = previousStyle.position;
      body.style.top = previousStyle.top;
      body.style.width = previousStyle.width;
      body.style.overflow = previousStyle.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [isAnyOverlayOpen]);

  const selectedBrandData = useMemo(
    () => brands.find((brand) => brand.name === selectedBrand),
    [selectedBrand]
  );

  const activeSearchPlaceholders = useMemo(() => {
    if (isBrandModalOpen) {
      return brands.map((brand) => `Search ${brand.name}...`);
    }

    if (isModelModalOpen && selectedBrand) {
      const models = brandModels[selectedBrand as keyof typeof brandModels] ?? [];

      if (models.length > 0) {
        return models.map((model) => `Search ${model.name}...`);
      }

      return [`Search ${selectedBrand} models...`];
    }

    if (!selectedModel) {
      return searchPlaceholders;
    }

    const modelLabel = `${selectedBrandData?.name ?? ""} ${selectedModel}`.trim();

    if (activeCategory) {
      const categoryParts = products
        .filter((product) => product.category === activeCategory)
        .slice(0, 4)
        .map((product) => product.name);

      return [
        `Search ${activeCategory} parts for ${modelLabel}...`,
        ...categoryParts.map((part) => `Search ${part} for ${modelLabel}...`),
      ];
    }

    const sampleParts = ["Cylinder Kit", "Air Filter", "Brake Pads", "Spark Plug"];

    return [
      `Search parts for your ${modelLabel}...`,
      ...sampleParts.map((part) => `Search ${part} for ${modelLabel}...`),
    ];
  }, [activeCategory, isBrandModalOpen, isModelModalOpen, selectedBrand, selectedBrandData, selectedModel, products]);

  const cartItems = useMemo<CartLine[]>(
    () =>
      Object.entries(cart)
        .map(([name, quantity]) => {
          const product = products.find((item) => item.name === name);
          return product ? { product, quantity } : null;
        })
        .filter((line): line is CartLine => line !== null),
    [cart, products]
  );

  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );

  const cartSubtotal = useMemo(
    () =>
      cartItems.reduce(
        (sum, item) => sum + parsePrice(item.product.price) * item.quantity,
        0
      ),
    [cartItems]
  );

  /** Remaining stock for a cart line, looked up by product name (how the cart is keyed) — Infinity if stock hasn't loaded yet, so the UI never blocks on a slow/failed fetch. */
  const getStockForName = (name: string) => {
    const product = products.find((entry) => entry.name === name);
    if (!product) return Infinity;
    const known = stockById[product.id];
    return known === undefined ? Infinity : known;
  };

  /**
   * Returns the warning note (if any) instead of showing it directly when
   * `silent` is set — needed because a caller adding several items in one
   * go (see handleReorderOrder) calling this normally would have each
   * call's setCartNotice clobber the previous one, so only the *last*
   * item's warning would ever actually be seen; a multi-item caller
   * collects these and shows one combined notice itself instead.
   */
  const addToCart = (
    product: Product,
    quantity = 1,
    { silent = false }: { silent?: boolean } = {}
  ): string | null => {
    const currentQty = cart[product.name] ?? 0;
    const available = stockById[product.id];

    // Real enforcement is server-side at checkout (see reserveStock in
    // lib/checkout-stock.ts) — this is just an early, friendlier warning so
    // a customer isn't surprised only once they try to pay.
    if (available !== undefined) {
      const room = available - currentQty;
      if (room <= 0) {
        const note = `${product.name} is out of stock.`;
        if (!silent) setCartNotice(note);
        return note;
      }
      if (quantity > room) {
        const note = `Only ${available} of "${product.name}" left in stock — added ${room}.`;
        if (!silent) setCartNotice(note);
        setCart((current) => ({ ...current, [product.name]: (current[product.name] ?? 0) + room }));
        return note;
      }
    }

    if (!silent) setCartNotice(null);
    setCart((current) => ({
      ...current,
      [product.name]: (current[product.name] ?? 0) + quantity,
    }));
    return null;
  };

  const incrementCartItem = (name: string) => {
    const currentQty = cart[name] ?? 0;
    const available = getStockForName(name);
    if (currentQty + 1 > available) {
      setCartNotice(`Only ${available} of "${name}" left in stock.`);
      return;
    }
    setCartNotice(null);
    setCart((current) => ({ ...current, [name]: (current[name] ?? 0) + 1 }));
  };

  const decrementCartItem = (name: string) => {
    setCart((current) => {
      const nextQuantity = (current[name] ?? 0) - 1;
      const next = { ...current };

      if (nextQuantity <= 0) {
        delete next[name];
      } else {
        next[name] = nextQuantity;
      }

      return next;
    });
  };

  const removeCartItem = (name: string) => {
    setCart((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const openAddressPanel = (mode: "checkout" | "manage") => {
    setAddressPanelMode(mode);
    setIsAddressPanelOpen(true);
    if (mode === "checkout") {
      setIsCartOpen(false);
    }
  };

  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [addressFormError, setAddressFormError] = useState<string | null>(null);

  /**
   * Address create/edit both go straight to the server — the address book is
   * never authoritative on the client (see Fix 6). Ownership is derived from
   * the session on the server; this only ever sends the form fields.
   */
  const handleSaveAddress = async (values: {
    label: string;
    flatNo: string;
    floor: string;
    area: string;
    landmark: string;
    city: string;
    pincode: string;
    contactName: string;
    phone: string;
  }) => {
    if (isSavingAddress) return;
    setIsSavingAddress(true);
    setAddressFormError(null);
    try {
      const response = editingAddressId
        ? await fetch(`/api/addresses/${editingAddressId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          })
        : await fetch("/api/addresses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAddressFormError(data.error ?? "Could not save this address.");
        return;
      }

      await refreshAddresses();
      setSelectedAddressId(data.address?.id ?? editingAddressId ?? null);
      setIsAddressFormOpen(false);
      setEditingAddressId(null);
    } catch {
      setAddressFormError("Could not save this address. Check your connection and try again.");
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    if (isSavingAddress) return;
    setIsSavingAddress(true);
    setAddressFormError(null);
    try {
      const response = await fetch(`/api/addresses/${id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAddressFormError(data.error ?? "Could not delete this address.");
        return;
      }
      await refreshAddresses();
      setIsAddressFormOpen(false);
      setEditingAddressId(null);
    } catch {
      setAddressFormError("Could not delete this address. Check your connection and try again.");
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleSetDefaultAddress = async (address: Address) => {
    if (isSavingAddress) return;
    setIsSavingAddress(true);
    try {
      await fetch(`/api/addresses/${address.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: address.label,
          flatNo: address.flatNo,
          floor: address.floor,
          area: address.area,
          landmark: address.landmark,
          city: address.city,
          pincode: address.pincode,
          contactName: address.contactName,
          phone: address.phone,
          isDefault: true,
        }),
      });
      await refreshAddresses();
    } finally {
      setIsSavingAddress(false);
    }
  };

  const refreshStock = async () => {
    try {
      const response = await fetch("/api/products/stock");
      if (!response.ok) return;
      const data = (await response.json()) as { stock: Record<string, number> };
      setStockById(data.stock);
    } catch {
      // Best-effort — the cart just won't warn ahead of time; checkout
      // still enforces stock for real server-side either way.
    }
  };

  useEffect(() => {
    void refreshStock();
  }, []);

  // Restore login from the server-side session after hydration so SSR and
  // client markup remain identical while the HttpOnly cookie stays private.
  useEffect(() => {
    void fetch("/api/auth/session")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          authenticated: boolean;
          user?: { phone?: string | null };
        };
      })
      .then((session) => {
        if (session?.authenticated && session.user?.phone) {
          setIsAuthenticated(true);
          setAuthPhone(session.user.phone);
        }
      })
      .catch(() => {});
  }, []);

  // Restore recent searches from a previous visit — same "start empty during
  // SSR, sync in client-side after mount" reasoning as auth above.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed.filter((entry) => typeof entry === "string").slice(0, MAX_RECENT_SEARCHES));
        }
      }
    } catch {
      // Unavailable/corrupt storage — recent searches just start empty.
    }
  }, []);

  // Restore the cart from a previous visit — same "start empty during SSR,
  // sync in client-side after mount" reasoning as auth/recent-searches above.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const validEntries = Object.entries(parsed).filter(
            (entry): entry is [string, number] => typeof entry[0] === "string" && typeof entry[1] === "number" && entry[1] > 0
          );
          if (validEntries.length > 0) {
            setCart(Object.fromEntries(validEntries));
          }
        }
      }
    } catch {
      // Unavailable/corrupt storage — cart just starts empty.
    }
  }, []);

  // Persist the cart on every change so a refresh doesn't lose it. A plain
  // write-on-change effect (rather than adding localStorage.setItem calls to
  // every individual mutator: addToCart, increment/decrementCartItem,
  // removeCartItem, handleReorderOrder, the post-checkout setCart({}), etc.)
  // so no future mutation site can accidentally forget to persist.
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // localStorage unavailable — cart just won't survive a refresh.
    }
  }, [cart]);

  // Restore which screen the customer was on from a previous visit/refresh —
  // same "start empty during SSR, sync in client-side after mount" reasoning
  // as auth/recent-searches/cart above. This app renders every screen
  // (product detail, an order, My Orders, a bike's catalog) as client-side
  // state under a single "/" URL rather than real routes, so without this a
  // plain refresh always dropped the customer back on the homepage no matter
  // what they were looking at.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(VIEW_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<PersistedView> | null;
      if (!parsed || typeof parsed !== "object") return;

      if (parsed.screen === "product" && typeof parsed.name === "string") {
        const product = findProduct(parsed.name);
        // The product may have been removed/unpublished since — nothing to
        // restore into in that case, just stay on the homepage.
        if (product) {
          if (typeof parsed.brand === "string") setSelectedBrand(parsed.brand);
          if (typeof parsed.model === "string") setSelectedModel(parsed.model);
          if (typeof parsed.year === "string") setSelectedYear(parsed.year);
          setSelectedProduct(product);
        }
      } else if (parsed.screen === "order" && typeof parsed.orderId === "string") {
        // orders itself may still be the demo/mock list at this point — the
        // auth-restore effect above kicks off the real /api/orders fetch,
        // and viewedOrder (derived from orders.find) resolves once that
        // lands, same as it would on any other render.
        setViewedOrderId(parsed.orderId);
      } else if (parsed.screen === "ordersList") {
        setIsOrdersPanelOpen(true);
      } else if (parsed.screen === "catalog") {
        if (typeof parsed.brand === "string") setSelectedBrand(parsed.brand);
        if (typeof parsed.model === "string") setSelectedModel(parsed.model);
        if (typeof parsed.year === "string") setSelectedYear(parsed.year);
        if (parsed.browsingAll) setIsBrowsingAllBikes(true);
        if (typeof parsed.category === "string") setActiveCategory(parsed.category);
      }
    } catch {
      // Unavailable/corrupt storage — the customer just starts on the
      // homepage, same as before this existed.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist which screen is showing on every change, mirroring the same
  // priority order the big view-switching render below uses (selectedProduct
  // > viewedOrderId > isOrdersPanelOpen > selectedModel/isBrowsingAllBikes >
  // homepage) — a plain write-on-change effect rather than adding
  // sessionStorage writes to every individual navigation call site
  // (handleGoHome, onProductSelect, openOrdersList, handleBrowseCategory,
  // …) so no future one can accidentally forget to persist.
  useEffect(() => {
    try {
      let view: PersistedView;
      if (selectedProduct) {
        view = { screen: "product", name: selectedProduct.name, brand: selectedBrand, model: selectedModel, year: selectedYear };
      } else if (viewedOrderId) {
        view = { screen: "order", orderId: viewedOrderId };
      } else if (isOrdersPanelOpen) {
        view = { screen: "ordersList" };
      } else if (selectedModel || isBrowsingAllBikes) {
        view = { screen: "catalog", brand: selectedBrand, model: selectedModel, year: selectedYear, browsingAll: isBrowsingAllBikes, category: activeCategory };
      } else {
        view = { screen: "home" };
      }
      sessionStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
    } catch {
      // sessionStorage unavailable — a refresh just won't restore the screen.
    }
  }, [selectedProduct, viewedOrderId, isOrdersPanelOpen, selectedBrand, selectedModel, selectedYear, isBrowsingAllBikes, activeCategory]);

  /** Records a committed search term (most-recent-first, deduped, capped) and persists it. */
  const addRecentSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches((current) => {
      const next = [trimmed, ...current.filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase())].slice(
        0,
        MAX_RECENT_SEARCHES
      );
      try {
        localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Best-effort — search still works this session even if it can't persist.
      }
      return next;
    });
  };

  const removeRecentSearch = (term: string) => {
    setRecentSearches((current) => {
      const next = current.filter((entry) => entry !== term);
      try {
        localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Not fatal — worst case the removed entry reappears next reload.
      }
      return next;
    });
  };

  /**
   * Products shown as live suggestions while typing. Cascades through
   * progressively looser matching so the box is never a dead end for a
   * genuine search term — only truly unrelated gibberish falls all the way
   * through to `isFallback: true`, at which point it shows a small set of
   * popular picks instead of nothing:
   *   1. Product name contains the query.
   *   2. Category / subcategory / brand / search tags contain the query.
   *   3. Any individual word of a multi-word query appears somewhere in the
   *      product's name/category/subcategory/brand/tags (scored by how many
   *      words hit, most relevant first).
   *   4. Nothing at all relates — fall back to the first few products so
   *      there's still something useful to click instead of a blank state.
   */
  const searchSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return { items: [] as typeof products, isFallback: false };

    const nameMatches = products.filter((product) => product.name.toLowerCase().includes(query));
    if (nameMatches.length > 0) return { items: nameMatches.slice(0, 8), isFallback: false };

    const haystackOf = (product: (typeof products)[number]) =>
      [product.name, product.category, product.productType ?? "", product.brand, ...product.searchTags]
        .join(" ")
        .toLowerCase();

    const broadMatches = products.filter((product) => haystackOf(product).includes(query));
    if (broadMatches.length > 0) return { items: broadMatches.slice(0, 8), isFallback: false };

    const words = query.split(/\s+/).filter((word) => word.length > 1);
    if (words.length > 0) {
      const scored = products
        .map((product) => {
          const haystack = haystackOf(product);
          const score = words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
          return { product, score };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);
      if (scored.length > 0) return { items: scored.slice(0, 8).map((entry) => entry.product), isFallback: false };
    }

    return { items: products.slice(0, 6), isFallback: true };
  }, [products, searchQuery]);

  /**
   * Selecting a suggestion remembers the search, then lands on the catalog
   * grid filtered to that item's category — showing every related part, not
   * just the one clicked — rather than jumping straight to a single
   * product's own page. Same "jump into the catalog, keep whatever bike's
   * already on file" behavior handleBrowseCategory/handleSelectCategoryPartType
   * use, staying on the current bike's parts page (e.g. "Duke 200 Parts")
   * when one is already selected instead of losing that context.
   */
  const handleSelectSearchSuggestion = (product: (typeof products)[number]) => {
    addRecentSearch(searchQuery.trim() || product.name);
    setIsSearchDropdownOpen(false);
    const filter = { category: product.category };
    if (lastBikeSelection) {
      restoreBikeSelection(lastBikeSelection, filter);
      return;
    }
    setSelectedProduct(null);
    setActiveCategory(filter.category);
    setSearchQuery("");
    setIsBrowsingAllBikes(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSelectRecentSearch = (term: string) => {
    setSearchQuery(term);
  };

  /**
   * Clicking a specific part type in a header category's dropdown (e.g.
   * "Brake Pads" under Brake Parts) searches for it directly — same
   * bike-aware "jump straight into the catalog" behavior handleBrowseCategory
   * uses, but scoped to this one part type as the search term instead of the
   * whole category, so real matching products (if any are stocked) show up
   * immediately rather than just landing on an unfiltered category browse.
   */
  const handleSelectCategoryPartType = (partType: string) => {
    setSelectedProduct(null);
    setActiveCategory("");
    setSearchQuery(partType);
    if (lastBikeSelection) {
      restoreBikeSelection(lastBikeSelection, { query: partType });
    } else {
      setIsBrowsingAllBikes(true);
    }
    setOpenCategoryDropdown(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Best-effort release for a checkout that was started but abandoned before payment (popup closed, payment failed). */
  const cancelAbandonedCheckout = async (orderId: string | undefined) => {
    if (!orderId) return;
    try {
      await fetch("/api/checkout/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
    } catch {
      // Not fatal — the server-side expiry sweep will release it later
      // regardless (see releaseExpiredReservations in lib/checkout-stock.ts).
    } finally {
      void refreshStock();
    }
  };

  /**
   * Loads this customer's real saved addresses from the server — the only
   * source of truth for the address book (see Fix 6: production never shows
   * fake/demo addresses). deliveryEstimate/availabilityNote/availabilityOk
   * aren't real columns on the Address model, just cosmetic copy the UI
   * already expected on every Address value, so they're filled in with a
   * fixed default here rather than threaded through the API.
   */
  const refreshAddresses = async () => {
    try {
      const response = await fetch("/api/addresses");
      if (!response.ok) return;
      const data = (await response.json()) as {
        addresses: Array<{
          id: string;
          label: string | null;
          contactName: string;
          phone: string;
          flatNo: string | null;
          floor: string | null;
          area: string;
          landmark: string | null;
          city: string;
          pincode: string;
          isDefault: boolean;
        }>;
      };

      const mapped: Address[] = data.addresses.map((addr) => ({
        id: addr.id,
        label: addr.label ?? "Home",
        flatNo: addr.flatNo ?? "",
        floor: addr.floor ?? "",
        area: addr.area,
        landmark: addr.landmark ?? "",
        city: addr.city,
        pincode: addr.pincode,
        contactName: addr.contactName,
        phone: addr.phone,
        isDefault: addr.isDefault,
        deliveryEstimate: "Delivery in 2-4 days",
        availabilityNote: "All parts available at this location",
        availabilityOk: true,
      }));

      setAddresses(mapped);
      setSelectedAddressId((current) => {
        if (current && mapped.some((address) => address.id === current)) return current;
        return mapped.find((address) => address.isDefault)?.id ?? mapped[0]?.id ?? null;
      });
    } catch {
      // Best-effort — keep whatever address list is already shown on failure.
    }
  };

  // Addresses are always the authenticated customer's own — load them fresh
  // on login/session-restore and clear them on logout rather than ever
  // reusing what an earlier signed-in customer on this device might have
  // left in state.
  useEffect(() => {
    if (isAuthenticated) {
      void refreshAddresses();
      return;
    }
    // Clearing stale state on logout, not synchronizing from an external
    // system — safe to disable for both calls below.
    /* eslint-disable react-hooks/set-state-in-effect */
    setAddresses([]);
    setSelectedAddressId(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isAuthenticated]);

  const refreshOrders = async () => {
    try {
      const response = await fetch("/api/orders");
      if (!response.ok) return;
      const data = (await response.json()) as {
        support?: { supportEmail: string | null; supportPhone: string | null };
        orders: Array<{
          id: string;
          placedAt: number;
          status: string;
          paymentStatus: string;
          bikeLabel: string | null;
          itemsTotal: number;
          taxAmount: number;
          deliveryCharge: number;
          discount: number;
          amount: number;
          shippingOrderId: string | null;
          shippingShipmentId: string | null;
          shippingProvider: ShippingProviderName | null;
          shippingStatus: string | null;
          shippingTrackingUrl: string | null;
          shippingAwbCode: string | null;
          shippingCourierName: string | null;
          deliveryExecutiveName: string | null;
          deliveryExecutivePhone: string | null;
          deliveryExecutivePhotoUrl: string | null;
          deliveryExecutiveLatitude: number | null;
          deliveryExecutiveLongitude: number | null;
          shippingWaybillUrl: string | null;
          shippingDeliveryFeeAmount: number | null;
          shippingPickupLatitude: number | null;
          shippingPickupLongitude: number | null;
          shippingDropLatitude: number | null;
          shippingDropLongitude: number | null;
          shippingDistanceMeters: number | null;
          shippingLastUpdatedAt: string | null;
          shippingEstimatedDeliveryAt: string | null;
          deliveryAddress: Partial<Address> | null;
          items: Array<{ id: string; listingId: string | null; canReview: boolean; review: CustomerReview | null; name: string; image: string | null; quantity: number; unitPrice: number; returnedQuantity: number; remainingReturnable: number }>;
          events: OrderEventEntry[];
          refundStatus: string;
          refundReason: string | null;
          refundAdminNote: string | null;
          refundAmount: number | null;
          refundRequestedAt: number | null;
          refundProcessedAt: number | null;
          returnStatus: string;
          returnReason: string | null;
          returnAdminNote: string | null;
          returnRequestedAt: number | null;
          returnShippingProvider: ShippingProviderName | null;
          returnShippingTrackingUrl: string | null;
          returnShippingAwbCode: string | null;
          returnShippingCourierName: string | null;
          returnReceivedAt: number | null;
          partialReturns: Array<{
            id: string;
            status: string;
            reason: string;
            adminNote: string | null;
            requestedAt: number;
            approvedAt: number | null;
            receivedAt: number | null;
            condition: "RESELLABLE" | "DAMAGED" | null;
            shippingProvider: ShippingProviderName | null;
            shippingStatus: string | null;
            shippingTrackingUrl: string | null;
            shippingAwbCode: string | null;
            shippingCourierName: string | null;
            refundStatus: string;
            refundAmount: number | null;
            refundProcessedAt: number | null;
            items: Array<{ orderItemId: string; quantity: number; productName: string }>;
          }>;
        }>;
      };

      // A past order's line items are looked up in the live catalog first
      // (richer data — real category/specs/etc. for re-order/browse), but
      // fall back to the order's own denormalized snapshot (name/image/price,
      // stored on the order itself at purchase time) when that lookup
      // misses. Without this fallback, renaming or archiving a product in
      // admin would silently drop that item — and if it was the order's only
      // item, the whole order — from a customer's past order history, even
      // though the order genuinely happened and was paid for.
      const productFromSnapshot = (item: { name: string; image: string | null; unitPrice: number }): Product => ({
        id: item.name,
        name: item.name,
        brand: "",
        category: "",
        price: formatPrice(item.unitPrice),
        gstRate: 18,
        image: item.image || "/assets/home/part-engine.png",
        images: [],
        stock: 0,
        description: "",
        sku: null,
        oemPartNumber: null,
        productType: null,
        specifications: [],
        compatibleVehicles: [],
        features: [],
        searchTags: [],
        material: null,
        finish: null,
        packIncludes: null,
        weightKg: null,
        warrantyMonths: null,
        countryOfOrigin: null,
        ratingAverage: null,
        ratingCount: 0,
        deliveryDaysMin: null,
        deliveryDaysMax: null,
        offerLabel: null,
        compatibleModels: [],
      });

      const mapped: Order[] = data.orders
        .map((dbOrder): Order | null => {
          const items: CartLine[] = dbOrder.items.map((item) => ({
            product: products.find((entry) => entry.id === item.listingId) ?? productFromSnapshot(item),
            orderItemId: item.id, listingId: item.listingId, canReview: item.canReview, review: item.review,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            returnedQuantity: item.returnedQuantity,
            remainingReturnable: item.remainingReturnable,
          }));

          if (items.length === 0) return null;

          const status = mapDbOrderStatus(dbOrder.status);
          const addr = dbOrder.deliveryAddress ?? {};
          const deliveryEstimate = addr.deliveryEstimate ?? "";

          return {
            id: dbOrder.id.slice(-8),
            dbId: dbOrder.id,
            placedAt: dbOrder.placedAt,
            status,
            isPaid: dbOrder.paymentStatus === "PAID",
            shippingOrderId: dbOrder.shippingOrderId,
            shippingShipmentId: dbOrder.shippingShipmentId,
            supportEmail: data.support?.supportEmail,
            supportPhone: data.support?.supportPhone,
            shippingProvider: dbOrder.shippingProvider,
            shippingStatus: dbOrder.shippingStatus,
            shippingTrackingUrl: dbOrder.shippingTrackingUrl,
            shippingAwbCode: dbOrder.shippingAwbCode,
            shippingCourierName: dbOrder.shippingCourierName,
            deliveryExecutiveName: dbOrder.deliveryExecutiveName,
            deliveryExecutivePhone: dbOrder.deliveryExecutivePhone,
            deliveryExecutivePhotoUrl: dbOrder.deliveryExecutivePhotoUrl,
            deliveryExecutiveLatitude: dbOrder.deliveryExecutiveLatitude,
            deliveryExecutiveLongitude: dbOrder.deliveryExecutiveLongitude,
            shippingWaybillUrl: dbOrder.shippingWaybillUrl,
            shippingDeliveryFeeAmount: dbOrder.shippingDeliveryFeeAmount,
            shippingPickupLatitude: dbOrder.shippingPickupLatitude,
            shippingPickupLongitude: dbOrder.shippingPickupLongitude,
            shippingDropLatitude: dbOrder.shippingDropLatitude,
            shippingDropLongitude: dbOrder.shippingDropLongitude,
            shippingDistanceMeters: dbOrder.shippingDistanceMeters,
            shippingLastUpdatedAt: dbOrder.shippingLastUpdatedAt,
            shippingEstimatedDeliveryAt: dbOrder.shippingEstimatedDeliveryAt,
            refundStatus: mapDbRefundStatus(dbOrder.refundStatus),
            refundReason: dbOrder.refundReason,
            refundAdminNote: dbOrder.refundAdminNote,
            refundAmount: dbOrder.refundAmount,
            refundRequestedAt: dbOrder.refundRequestedAt,
            refundProcessedAt: dbOrder.refundProcessedAt,
            returnStatus: mapDbReturnStatus(dbOrder.returnStatus),
            returnReason: dbOrder.returnReason,
            returnAdminNote: dbOrder.returnAdminNote,
            returnRequestedAt: dbOrder.returnRequestedAt,
            returnShippingProvider: dbOrder.returnShippingProvider,
            returnShippingTrackingUrl: dbOrder.returnShippingTrackingUrl,
            returnShippingAwbCode: dbOrder.returnShippingAwbCode,
            returnShippingCourierName: dbOrder.returnShippingCourierName,
            returnReceivedAt: dbOrder.returnReceivedAt,
            partialReturns: dbOrder.partialReturns.map((partialReturn) => ({
              id: partialReturn.id,
              status: mapDbPartialReturnStatus(partialReturn.status),
              reason: partialReturn.reason,
              adminNote: partialReturn.adminNote,
              requestedAt: partialReturn.requestedAt,
              approvedAt: partialReturn.approvedAt,
              receivedAt: partialReturn.receivedAt,
              condition: partialReturn.condition,
              shippingProvider: partialReturn.shippingProvider,
              shippingStatus: partialReturn.shippingStatus,
              shippingTrackingUrl: partialReturn.shippingTrackingUrl,
              shippingAwbCode: partialReturn.shippingAwbCode,
              shippingCourierName: partialReturn.shippingCourierName,
              refundStatus: mapDbPartialRefundStatus(partialReturn.refundStatus),
              refundAmount: partialReturn.refundAmount,
              refundProcessedAt: partialReturn.refundProcessedAt,
              items: partialReturn.items,
            })),
            statusNote:
              status === "delivered"
                ? "Your order was delivered"
                : status === "cancelled"
                ? "Your order has been cancelled"
                : dbOrder.shippingStatus
                ? `Delivery status: ${dbOrder.shippingStatus}`
                : "Your order is being prepared",
            // Was hardcoded null for every real order — every customer with
            // an out-for-delivery/processing order literally saw the text
            // "Expected by null" on their tracking page.
            expectedDeliveryDate: computeExpectedDeliveryLabel(dbOrder.placedAt, deliveryEstimate),
            bikeLabel: dbOrder.bikeLabel ?? "your bike",
            items,
            itemTotal: dbOrder.itemsTotal,
            taxAmount: dbOrder.taxAmount,
            deliveryCharge: dbOrder.deliveryCharge,
            discount: dbOrder.discount,
            total: dbOrder.amount,
            events: dbOrder.events,
            address: {
              id: "server",
              label: addr.label ?? "Delivery Address",
              flatNo: addr.flatNo ?? "",
              floor: addr.floor ?? "",
              area: addr.area ?? "",
              landmark: addr.landmark ?? "",
              city: addr.city ?? "",
              pincode: addr.pincode ?? "",
              contactName: addr.contactName ?? "",
              phone: addr.phone ?? "",
              deliveryEstimate,
              availabilityNote: addr.availabilityNote ?? "",
              availabilityOk: addr.availabilityOk ?? true,
            },
          };
        })
        .filter((order): order is Order => order !== null);

      if (mapped.length > 0) {
        setOrders(mapped);
      }
    } catch {
      // Best-effort refresh — keep whatever is already shown on failure.
    }
  };

  // Mirrors the addresses effect above: orders were previously only ever
  // refreshed from an explicit action (opening "My Orders", a fresh login,
  // after a refund/cancel). That missed the session-restore-on-page-refresh
  // path — if "My Orders" was the persisted view, isOrdersPanelOpen gets
  // restored directly (see the sessionStorage-restore effect above) without
  // going through openOrdersList, so the real orders never got fetched and
  // the customer saw stale demo/empty state despite having a valid session.
  useEffect(() => {
    // Synchronizing from the isAuthenticated flag (an external system —
    // the server-side session), not a plain derived-state update — same
    // justification as the addresses effect above.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    if (isAuthenticated) void refreshOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Keeps a Borzo order's tracking screen live while the customer actually
  // has it open — courier assignment/live position/status previously only
  // ever updated when an admin happened to click "Refresh Tracking" on a
  // completely different (admin) screen, which is why a genuinely-assigned
  // courier could sit invisible on the customer's own order page for hours.
  // See app/api/orders/[id]/refresh-tracking for the server side; cheap and
  // safe to call repeatedly since it no-ops for a non-Borzo/finished order
  // or one refreshed too recently.
  useEffect(() => {
    if (!viewedOrder) return;
    if (viewedOrder.shippingProvider !== "BORZO") return;
    if (viewedOrder.status === "delivered" || viewedOrder.status === "cancelled") return;

    let cancelled = false;
    const poll = async () => {
      try {
        await fetch(`/api/orders/${viewedOrder.dbId}/refresh-tracking`, { method: "POST" });
      } catch {
        // Best-effort — a transient failure just means the next tick tries again.
      }
      if (!cancelled) await refreshOrders();
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // refreshOrders is intentionally omitted — its identity changes every
    // render but it only ever re-fetches from the server and replaces
    // state wholesale, so the closure captured here never goes stale in a
    // way that matters; re-keying only on the order's own identity/status
    // is what actually determines whether this effect should be running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedOrder?.dbId, viewedOrder?.shippingProvider, viewedOrder?.status]);

  const openOrdersList = () => {
    setSelectedProduct(null);
    setViewedOrderId(null);
    setIsOrdersPanelOpen(true);
    if (authPhone) void refreshOrders();
  };

  const handleReorderOrder = (order: Order) => {
    // Each item is added silently and its warning (if any) collected here,
    // then shown as one combined notice — calling addToCart normally in a
    // loop would have each call's notice overwrite the previous one, so
    // only the last item's warning would ever actually surface.
    const notes = order.items
      .map(({ product, quantity }) => addToCart(product, quantity, { silent: true }))
      .filter((note): note is string => note !== null);
    setCartNotice(notes.length > 0 ? notes.join(" ") : null);

    setIsOrdersPanelOpen(false);
    setIsCartOpen(true);
  };

  const [isRequestingReturn, setIsRequestingReturn] = useState(false);
  const [returnRequestError, setReturnRequestError] = useState<string | null>(null);

  /**
   * Customer-initiated product return — see app/api/orders/[id]/return for
   * the server side. This only starts the physical return (admin approve
   * -> pickup -> received); the refund itself is requested automatically
   * once the admin confirms the item is back at the warehouse. Refetches
   * this phone's orders on success so the just-updated returnStatus shows
   * up without a full page reload.
   */
  const requestReturn = async (order: Order, reason: string) => {
    if (!isAuthenticated || isRequestingReturn) return;

    setIsRequestingReturn(true);
    setReturnRequestError(null);
    try {
      const response = await fetch(`/api/orders/${order.dbId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setReturnRequestError(data.error ?? "Could not submit the return request.");
        return;
      }
      await refreshOrders();
    } catch {
      setReturnRequestError("Could not submit the return request. Check your connection and try again.");
    } finally {
      setIsRequestingReturn(false);
    }
  };

  const [isRequestingPartialReturn, setIsRequestingPartialReturn] = useState(false);
  const [partialReturnError, setPartialReturnError] = useState<string | null>(null);

  /**
   * Customer-initiated item/quantity-level return — see
   * app/api/orders/[id]/returns (plural; distinct from the whole-order
   * endpoint above). The server re-verifies ownership, delivery state, and
   * remaining returnable quantity itself (lib/order-returns/service.ts); the
   * selected lines sent here are only ever a starting point, never trusted
   * as final. Refetches orders on success so the new entry shows up in
   * order.partialReturns immediately.
   */
  const requestPartialReturn = async (order: Order, reason: string, lines: Array<{ orderItemId: string; quantity: number }>): Promise<boolean> => {
    if (!isAuthenticated || isRequestingPartialReturn) return false;

    setIsRequestingPartialReturn(true);
    setPartialReturnError(null);
    try {
      const response = await fetch(`/api/orders/${order.dbId}/returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, items: lines }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setPartialReturnError(data.error ?? "Could not submit the return request.");
        return false;
      }
      await refreshOrders();
      return true;
    } catch {
      setPartialReturnError("Could not submit the return request. Check your connection and try again.");
      return false;
    } finally {
      setIsRequestingPartialReturn(false);
    }
  };

  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [cancelOrderError, setCancelOrderError] = useState<string | null>(null);

  /**
   * Customer-initiated order cancellation — see app/api/orders/[id]/cancel.
   * A paid order's refund is requested automatically server-side as part of
   * this, so (unlike requestReturn above) there's no separate reason step.
   */
  const cancelOrder = async (order: Order) => {
    if (!isAuthenticated || isCancellingOrder) return;

    setIsCancellingOrder(true);
    setCancelOrderError(null);
    try {
      const response = await fetch(`/api/orders/${order.dbId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setCancelOrderError(data.error ?? "Could not cancel this order.");
        return;
      }
      await refreshOrders();
    } catch {
      setCancelOrderError("Could not cancel this order. Check your connection and try again.");
    } finally {
      setIsCancellingOrder(false);
    }
  };

  const handleSelectDeliveryAddress = async (address: Address) => {
    setSelectedAddressId(address.id);

    if (addressPanelMode !== "checkout") {
      setIsAddressPanelOpen(false);
      return;
    }

    // Guards against a double-click/double-tap (or a slow network prompting
    // an impatient second tap) firing this twice — without this, two
    // concurrent calls here would create two separate orders and reserve
    // stock twice for what the customer only meant to buy once.
    if (isCheckingOut) {
      return;
    }

    if (!isAuthenticated) {
      setCheckoutError("Please log in again before checking out.");
      return;
    }

    setCheckoutError(null);
    setIsCheckingOut(true);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bikeLabel:
            selectedBrandData && selectedModel
              ? `${selectedBrandData.name} ${selectedModel} (${selectedYear})`
              : undefined,
          // Only the id of a saved, server-owned address is ever sent — the
          // server looks it up scoped to the current session and rejects
          // checkout if it doesn't belong to this customer (see Fix 6).
          addressId: address.id,
          items: cartItems.map((line) => ({
            id: line.product.id,
            quantity: line.quantity,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        // 409 = one or more cart items just sold out (see /api/checkout) —
        // refresh what we know about stock so the UI reflects it immediately
        // instead of letting the customer retry into the same wall.
        if (response.status === 409) {
          void refreshStock();
        }
        throw new Error(data.error || "Could not start checkout.");
      }

      await loadRazorpayCheckout();
      if (!window.Razorpay) {
        throw new Error("Razorpay checkout could not be loaded.");
      }

      const razorpay = new window.Razorpay({
        key: data.keyId,
        amount: Math.round(data.amount * 100),
        currency: data.currency,
        order_id: data.razorpayOrderId,
        name: "Deep Automobiles",
        description: `Order #${String(data.orderId).slice(-8)}`,
        prefill: {
          name: address.contactName,
          // Razorpay expects "contact" as +{country code}{number} — a bare
          // 10-digit number with no "+" silently defaults to US (+1), so
          // Razorpay doesn't recognize it as the logged-in number and shows
          // whatever contact it remembers instead ("Using as ..."). All
          // phone numbers in this app are already validated as 10-digit
          // Indian numbers (see checkout's own /^\d{10}$/ check), so +91 is
          // always correct here.
          contact: authPhone ? `+91${authPhone}` : undefined,
        },
        theme: { color: "#025632" },
        handler: (paymentResponse) => {
          void (async () => {
            try {
              const verifyRes = await fetch("/api/checkout/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  orderId: data.orderId,
                  ...paymentResponse,
                }),
              });
              const verifyData = await verifyRes.json();
              if (!verifyRes.ok) {
                throw new Error(verifyData.error || "Payment verification failed.");
              }

              setCart({});
              setIsAddressPanelOpen(false);
              await refreshOrders();
              void refreshStock();
              setViewedOrderId(null);
              setIsOrdersPanelOpen(true);
            } catch (error) {
              setCheckoutError(
                error instanceof Error ? error.message : "Payment verification failed."
              );
            } finally {
              setIsCheckingOut(false);
            }
          })();
        },
        modal: {
          ondismiss: () => {
            setIsCheckingOut(false);
            void cancelAbandonedCheckout(data.orderId);
          },
        },
      });

      razorpay.on("payment.failed", () => {
        setCheckoutError("Payment failed. Please try again.");
        setIsCheckingOut(false);
        void cancelAbandonedCheckout(data.orderId);
      });

      razorpay.open();
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Could not start checkout.");
      setIsCheckingOut(false);
    }
  };

  const handleAccountClick = () => {
    if (!isAuthenticated) {
      setIsLoginModalOpen(true);
      return;
    }

    setIsCartOpen(false);
    setIsAccountMenuOpen((current) => !current);
  };

  const handleMobileAccountClick = () => {
    if (isBrandModalOpen || isModelModalOpen) {
      setIsAccountMenuOpen(false);
      return;
    }

    setIsCartOpen(false);
    setIsAccountMenuOpen((current) => !current);
  };

  const openCart = () => {
    setIsAccountMenuOpen(false);
    setIsCartOpen(true);
  };

  const handleLogout = () => {
    void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
      setIsAuthenticated(false);
      setAuthPhone(null);
      setIsAccountMenuOpen(false);
    });
  };

  const requestCustomerOtp = async (phone: string) => {
    try {
      const response = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        return data.error ?? "Could not send OTP.";
      }
      return null;
    } catch {
      return "Could not send OTP. Check your connection and try again.";
    }
  };

  const verifyCustomerOtp = async (phone: string, otp: string) => {
    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        return data.error ?? "Could not verify OTP.";
      }
      return null;
    } catch {
      return "Could not verify OTP. Check your connection and try again.";
    }
  };

  const filteredBrands = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return brands;
    }

    return brands.filter((brand) =>
      brand.name.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const currentModels = useMemo(() => {
    if (!selectedBrand) {
      return [];
    }

    return brandModels[selectedBrand as keyof typeof brandModels] ?? [];
  }, [selectedBrand]);

  const filteredModels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return currentModels;
    }

    return currentModels.filter((model) =>
      model.name.toLowerCase().includes(query)
    );
  }, [currentModels, searchQuery]);

  const selectedModelData = useMemo(
    () => currentModels.find((model) => model.name === selectedModel),
    [currentModels, selectedModel]
  );

  const modelImage =
    selectedModelData?.image ?? selectedBrandData?.image ?? "/assets/home/bike-honda.png";

  const handleGoHome = () => {
    setSelectedBrand(null);
    setSelectedModel(null);
    setSelectedProduct(null);
    setActiveCategory("");
    setSearchQuery("");
    setIsBrandModalOpen(false);
    setIsModelModalOpen(false);
    setIsBrowsingAllBikes(false);
    setViewedOrderId(null);
    setIsOrdersPanelOpen(false);
    // lastBikeSelection is deliberately left alone — see its declaration —
    // so a homepage category click still remembers this bike.
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openBrandModal = () => {
    setSearchQuery("");
    setIsAccountMenuOpen(false);
    setIsModelModalOpen(false);
    setIsBrandModalOpen(true);
  };

  const openModelModal = () => {
    if (!selectedBrand) {
      openBrandModal();
      return;
    }

    setSearchQuery("");
    setIsAccountMenuOpen(false);
    setIsBrandModalOpen(false);
    setIsModelModalOpen(true);
  };

  const goToBrandSlide = (index: number) => {
    setActiveBrandSlide(((index % carouselBrands.length) + carouselBrands.length) % carouselBrands.length);
  };

  const nextBrandSlide = () => goToBrandSlide(activeBrandSlide + 1);
  const prevBrandSlide = () => goToBrandSlide(activeBrandSlide - 1);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveBrandSlide((current) => (current + 1) % carouselBrands.length);
    }, 4000);

    return () => window.clearInterval(timer);
  }, []);

  const scrollProductStrip = (
    ref: RefObject<HTMLDivElement | null>,
    direction: "left" | "right"
  ) => {
    ref.current?.scrollBy({
      left: direction === "left" ? -640 : 640,
      behavior: "smooth",
    });
  };

  const selectBrand = (brand: string) => {
    setSelectedBrand(brand);
    setSelectedModel(null);
    setSelectedProduct(null);
    setSearchQuery("");
    setIsAccountMenuOpen(false);
    setIsBrandModalOpen(false);
    setIsModelModalOpen(true);
  };

  const selectModel = (model: string) => {
    setSelectedModel(model);
    setSelectedProduct(null);
    setActiveCategory("");
    setSearchQuery("");
    setIsModelModalOpen(false);
    setIsPartsModalOpen(false);
    setShowPartsHint(true);
    setIsBrowsingAllBikes(false);
    if (selectedBrand) {
      setLastBikeSelection({ brand: selectedBrand, model, year: selectedYear });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Restores a remembered bike selection and jumps into its catalog, optionally pre-filtered to a category/search. */
  const restoreBikeSelection = (
    bike: { brand: string; model: string; year: string },
    filter?: { category?: string; query?: string } | null
  ) => {
    setSelectedBrand(bike.brand);
    setSelectedModel(bike.model);
    setSelectedYear(bike.year);
    setSelectedProduct(null);
    setActiveCategory(filter?.category ?? "");
    setSearchQuery(filter?.query ?? "");
    setIsBrowsingAllBikes(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** "Continue with {bike}" on the homepage hero — resumes the last bike the user picked without re-running the brand/model wizard. */
  const resumeLastBike = () => {
    if (lastBikeSelection) {
      restoreBikeSelection(lastBikeSelection);
    }
  };

  // Homepage/navbar category click. If the user already has a bike on file
  // (picked just now, or remembered from before a Home click), jump straight
  // into that bike's catalog filtered to the category — no need to make them
  // re-pick a bike they already told us. Otherwise browse the category across
  // every brand, mixed, instead of forcing the brand/model picker just to
  // look at a category.
  const handleBrowseCategory = (categoryTitle: string) => {
    const filter = homeCategoryFilters[categoryTitle] ?? null;

    if (lastBikeSelection) {
      restoreBikeSelection(lastBikeSelection, filter);
      return;
    }

    setSelectedProduct(null);
    setActiveCategory(filter?.category ?? "");
    setSearchQuery(filter?.query ?? "");
    setIsBrowsingAllBikes(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleHeroSearch = () => {
    if (!selectedBrand) {
      openBrandModal();
      return;
    }

    openModelModal();
  };

  const handleSelectBikePart = (part: string) => {
    setActiveCategory(part);
    setIsPartsModalOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % searchPlaceholders.length);
    }, 2200);

    return () => window.clearInterval(timer);
  }, []);

  const accountMenuBlock = (
    <div className="relative">
      <button
        type="button"
        onClick={handleAccountClick}
        aria-expanded={isAccountMenuOpen}
        className="flex h-10 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-950"
      >
        <User className="size-4.5" />
        Account
        {isAuthenticated ? <ChevronDown className="size-3.5" /> : null}
      </button>

      <AccountMenu
        isOpen={isAccountMenuOpen}
        authPhone={authPhone}
        onClose={() => setIsAccountMenuOpen(false)}
        onOpenAddresses={() => {
          setIsAccountMenuOpen(false);
          openAddressPanel("manage");
        }}
        onOpenOrders={() => {
          setIsAccountMenuOpen(false);
          openOrdersList();
        }}
        onLogout={handleLogout}
      />
    </div>
  );

  const isSelectionModalOpen =
    isBrandModalOpen || isModelModalOpen || isPartsModalOpen;
  const isRightPanelOpen = isCartOpen || isAddressPanelOpen;

  const mobileAccountMenu =
    isAccountMenuOpen && !isSelectionModalOpen && !isRightPanelOpen ? (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={() => setIsAccountMenuOpen(false)}
        className="fixed inset-0 z-40 cursor-default"
      />

      <div className="fixed inset-x-3 bottom-4 z-50 overflow-hidden rounded-2xl bg-white shadow-[0_14px_34px_rgba(24,24,27,0.22)] ring-1 ring-zinc-200 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e9fef5] text-[#025632]">
            <User className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black text-[#070e2b]">
              My Account
            </span>
            <span className="block truncate text-xs text-zinc-500">
              {authPhone ? `+91 ${authPhone}` : "Welcome back"}
            </span>
          </span>
        </div>

        <div className="p-1.5">
          {isAuthenticated ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  openAddressPanel("manage");
                }}
                className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-bold text-[#070e2b] transition hover:bg-zinc-50"
              >
                <MapPin className="size-4.5 text-zinc-500" />
                Saved Addresses
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  openOrdersList();
                }}
                className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-bold text-[#070e2b] transition hover:bg-zinc-50"
              >
                <Package className="size-4.5 text-zinc-500" />
                My Orders
              </button>
              <div className="my-1 h-px bg-zinc-100" />
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-bold text-[#025632] transition hover:bg-[#e9fef5]"
              >
                <LogOut className="size-4.5" />
                Logout
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsAccountMenuOpen(false);
                setIsLoginModalOpen(true);
              }}
              className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-bold text-[#070e2b] transition hover:bg-zinc-50"
            >
              <User className="size-4.5 text-zinc-500" />
              Login / Account
            </button>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <main className="min-h-screen bg-[#fbfbfa] text-zinc-950">
      <header className="sticky top-0 z-30 hidden border-b border-zinc-200 bg-white shadow-[0_1px_0_rgba(24,24,27,0.04)] lg:block">
        <div className="mx-auto grid h-16 w-full max-w-[1520px] grid-cols-[240px_minmax(260px,1fr)_200px] items-center gap-3 px-4 xl:grid-cols-[270px_minmax(340px,1fr)_240px] xl:px-6">
          <button
            type="button"
            onClick={handleGoHome}
            aria-label="Go home"
            className="flex min-w-0 items-center text-left"
          >
            <Image
              src="/deep-logo-trimmed.png"
              alt="Deep Automobiles"
              width={1500}
              height={837}
              className="h-12 w-auto shrink-0 object-contain"
            />
          </button>

          <div className="relative mx-auto w-full max-w-[520px]">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (searchSuggestions.items.length > 0) {
                  handleSelectSearchSuggestion(searchSuggestions.items[0]);
                } else if (searchQuery.trim()) {
                  addRecentSearch(searchQuery);
                }
              }}
              className="flex h-10 w-full min-w-0 items-center overflow-hidden rounded-full border-2 border-[#025632] bg-white shadow-sm focus-within:border-[#013720] focus-within:ring-2 focus-within:ring-[#025632]/20"
            >
              <Search className="ml-4 size-4.5 shrink-0 text-zinc-950" />
              <div className="relative min-w-0 flex-1">
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onFocus={() => setIsSearchDropdownOpen(true)}
                  className="relative z-10 h-10 w-full min-w-0 bg-transparent py-2.5 pl-3 pr-8 text-xs font-medium text-zinc-950 outline-none"
                  aria-label="Search parts"
                />
                {!searchQuery ? (
                  <span
                    key={placeholderIndex}
                    className="pointer-events-none absolute left-3 top-1/2 z-0 max-w-[calc(100%-0.75rem)] -translate-y-1/2 truncate text-xs font-medium text-zinc-500 animate-in fade-in slide-in-from-bottom-1 duration-300"
                  >
                    {
                      activeSearchPlaceholders[
                        placeholderIndex % activeSearchPlaceholders.length
                      ]
                    }
                  </span>
                ) : null}
              </div>
              {searchQuery ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearchQuery("");
                    setIsSearchDropdownOpen(true);
                  }}
                  className="relative z-10 mr-2 grid size-6 shrink-0 place-items-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </form>

            {isSearchDropdownOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Close search suggestions"
                  onClick={() => setIsSearchDropdownOpen(false)}
                  className="fixed inset-0 z-40 cursor-default"
                />
                <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_16px_40px_rgba(24,24,27,0.16)]">
                  {searchQuery.trim() ? (
                    searchSuggestions.items.length > 0 ? (
                      <>
                        {searchSuggestions.isFallback ? (
                          <p className="px-4 pt-3 text-[10px] font-black uppercase tracking-wide text-zinc-400">
                            No exact matches — related picks
                          </p>
                        ) : null}
                        <ul className="max-h-72 overflow-y-auto py-1">
                          {searchSuggestions.items.map((product) => (
                            <li key={product.name}>
                              <button
                                type="button"
                                onClick={() => handleSelectSearchSuggestion(product)}
                                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-xs font-bold text-zinc-800 transition hover:bg-zinc-50"
                              >
                                <Search className="size-3.5 shrink-0 text-zinc-400" />
                                <span className="truncate">{product.name}</span>
                                <span className="ml-auto shrink-0 text-[11px] font-medium text-zinc-400">
                                  {product.category}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="px-4 py-4 text-center text-xs font-medium text-zinc-400">
                        No parts match &ldquo;{searchQuery.trim()}&rdquo;
                      </p>
                    )
                  ) : recentSearches.length > 0 ? (
                    <>
                      <p className="px-4 pt-3 text-[10px] font-black uppercase tracking-wide text-zinc-400">
                        Recent Searches
                      </p>
                      <ul className="max-h-72 overflow-y-auto py-1">
                        {recentSearches.map((term) => (
                          <li key={term} className="group flex items-center">
                            <button
                              type="button"
                              onClick={() => handleSelectRecentSearch(term)}
                              className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-4 py-2.5 text-left text-xs font-bold text-zinc-800 transition hover:bg-zinc-50"
                            >
                              <Clock className="size-3.5 shrink-0 text-zinc-400" />
                              <span className="truncate">{term}</span>
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove "${term}" from recent searches`}
                              onClick={() => removeRecentSearch(term)}
                              className="mr-2 shrink-0 rounded-full p-1.5 text-zinc-300 opacity-0 transition hover:bg-zinc-100 hover:text-zinc-600 group-hover:opacity-100"
                            >
                              <X className="size-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="px-4 py-4 text-center text-xs font-medium text-zinc-400">
                      Start typing to search parts
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </div>

          <nav className="flex items-center justify-end gap-4 xl:gap-6">
            {accountMenuBlock}

            <button
              type="button"
              onClick={openCart}
              disabled={cartCount === 0}
              aria-disabled={cartCount === 0}
              className={
                cartCount > 0
                  ? "flex h-10 items-center gap-2 rounded-lg bg-zinc-950 pl-3 pr-4 text-white transition hover:bg-zinc-800"
                  : "flex items-center gap-1.5 text-xs font-black text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
              }
            >
              <ShoppingCart className="size-5" />
              {cartCount > 0 ? (
                <span className="text-left leading-tight">
                  <span className="block text-[11px] font-medium text-zinc-300">
                    {cartCount} {cartCount === 1 ? "item" : "items"}
                  </span>
                  <span className="block text-sm font-black">
                    &#8377;{formatPrice(cartSubtotal)}
                  </span>
                </span>
              ) : (
                "Cart"
              )}
            </button>
          </nav>
        </div>

        {/*
          Only on the plain home/hero view — hidden for every other view
          (product detail, order detail, My Orders, and CatalogView, which
          has its own category pill row). Mirrors the same set of checks the
          big view-switching ternary further down uses to pick the hero
          branch: `selectedProduct ? ... : viewedOrder ? ... :
          isOrdersPanelOpen ? ... : (selectedModel || isBrowsingAllBikes) ?
          <CatalogView /> : <hero>`.
        */}
        {!selectedProduct && !viewedOrder && !isOrdersPanelOpen && !selectedModel && !isBrowsingAllBikes ? (
          <nav className="border-t border-zinc-100">
            <div className="mx-auto flex h-10 w-full max-w-[1520px] items-center justify-between gap-1 px-3 xl:px-6">
              {headerCategories.map((category) => {
                const isAllCategories = category === "All Categories";
                const isOpen = openCategoryDropdown === category;
                const partTypes = categoryPartTypes[category] ?? [];

                return (
                  <div key={category} className="relative">
                    <button
                      type="button"
                      onClick={(event) => {
                        if (isAllCategories) {
                          handleBrowseCategory("");
                          return;
                        }
                        // Read the rect synchronously, before setState — see
                        // the matching comment on the catalog page's category
                        // pills for why (a synthetic event's currentTarget
                        // can be null by the time a state updater runs).
                        const willOpen = openCategoryDropdown !== category;
                        if (willOpen) {
                          const rect = event.currentTarget.getBoundingClientRect();
                          // Clamp so the w-64 (256px) panel never runs past
                          // the right edge of the viewport — the last couple
                          // of category buttons sit close to that edge.
                          const menuWidth = 256;
                          const margin = 12;
                          const left = Math.min(rect.left, window.innerWidth - menuWidth - margin);
                          setCategoryDropdownPos({ top: rect.bottom + 6, left: Math.max(margin, left) });
                        }
                        setOpenCategoryDropdown(willOpen ? category : null);
                      }}
                      aria-expanded={!isAllCategories ? isOpen : undefined}
                      className={`flex h-8 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1 text-[9px] font-bold transition xl:px-2 xl:text-[11px] ${
                        isOpen ? "bg-zinc-100 text-zinc-950" : "text-zinc-800 hover:bg-zinc-100 hover:text-zinc-950"
                      }`}
                    >
                      {category}
                      {!isAllCategories ? (
                        <ChevronDown
                          className={`size-3 shrink-0 transition-transform xl:size-3.5 ${isOpen ? "rotate-180" : ""}`}
                        />
                      ) : null}
                    </button>

                    {isOpen ? (
                      <>
                        <button
                          type="button"
                          aria-label="Close category menu"
                          onClick={() => setOpenCategoryDropdown(null)}
                          className="fixed inset-0 z-40 cursor-default"
                        />
                        <div
                          className="fixed z-50 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_16px_40px_rgba(24,24,27,0.16)]"
                          style={{ top: categoryDropdownPos.top, left: categoryDropdownPos.left }}
                        >
                          {partTypes.length > 0 ? (
                            <ul className="max-h-64 overflow-y-auto py-1">
                              {partTypes.map((partType) => (
                                <li key={partType}>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectCategoryPartType(partType)}
                                    className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
                                  >
                                    <Package className="size-3.5 shrink-0 text-zinc-400" />
                                    <span className="truncate">{partType}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="px-4 py-3 text-center text-xs font-medium text-zinc-400">
                              No parts listed yet
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              handleBrowseCategory(category);
                              setOpenCategoryDropdown(null);
                            }}
                            className="flex w-full items-center justify-center gap-1 border-t border-zinc-100 px-4 py-2.5 text-xs font-black text-[#025632] transition hover:bg-[#e9fef5]"
                          >
                            View all in {category}
                            <ArrowRight className="size-3.5" />
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </nav>
        ) : null}
      </header>

      <div
        className={`fixed inset-x-3 z-[60] flex items-center gap-2 transition-[bottom] duration-200 ease-out lg:hidden ${
          isAccountMenuOpen && !isSelectionModalOpen
            ? isAuthenticated
              ? "bottom-56"
              : "bottom-36"
            : "bottom-4"
        } ${isRightPanelOpen || isSelectionModalOpen ? "hidden" : ""}`}
      >
        <form
          onSubmit={(event) => event.preventDefault()}
          className="flex h-12 min-w-0 flex-1 overflow-hidden rounded-full border-2 border-[#025632] bg-white shadow-[0_10px_30px_rgba(24,24,27,0.18)] focus-within:border-[#013720]"
        >
          <div className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={handleGoHome}
              aria-label="Go home"
              className="absolute left-2.5 top-1/2 z-20 grid size-7 -translate-y-1/2 place-items-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950"
            >
              <Image
                src="/tyre-icon.png"
                alt="Go home"
                width={28}
                height={28}
                className="h-full w-full object-contain"
              />
            </button>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="relative z-10 h-full w-full min-w-0 bg-transparent pl-11 pr-3 text-xs outline-none"
              aria-label="Search parts"
            />
            {!searchQuery ? (
              <span
                key={placeholderIndex}
                className="pointer-events-none absolute left-11 top-1/2 z-0 max-w-[calc(100%-3.75rem)] -translate-y-1/2 truncate text-xs text-zinc-500 animate-in fade-in slide-in-from-bottom-1 duration-300"
              >
                {
                  activeSearchPlaceholders[
                    placeholderIndex % activeSearchPlaceholders.length
                  ]
                }
              </span>
            ) : null}
          </div>
          <button
            type="submit"
            className="m-1 flex h-10 items-center justify-center rounded-full bg-zinc-950 px-5 text-xs font-bold text-white transition hover:bg-zinc-800"
          >
            Search
          </button>
        </form>

        {null}

        {!isSelectionModalOpen ? (
          <button
            type="button"
            onClick={handleMobileAccountClick}
            aria-label="Account"
            aria-expanded={isAccountMenuOpen}
            className="grid size-12 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-950 shadow-[0_10px_30px_rgba(24,24,27,0.18)] transition hover:bg-zinc-50"
          >
            <User className="size-5" />
          </button>
        ) : null}
      </div>
      {mobileAccountMenu}

      <div
        className={
          selectedProduct || viewedOrder || isOrdersPanelOpen
            ? "w-full"
            : selectedModel || isBrowsingAllBikes
            ? "w-full bg-white px-7 pb-24 pt-3 sm:px-10 lg:px-14 lg:pb-12"
            : "w-full pb-24 lg:pb-4"
        }
      >
        {selectedProduct ? (
          <ProductDetailDrawer
            key={selectedProduct.name}
            product={selectedProduct}
            selectedBrand={selectedBrandData}
            selectedModel={selectedModel ?? ""}
            selectedYear={selectedYear}
            activeCategory={activeCategory}
            cartQuantity={cart[selectedProduct.name] ?? 0}
            onClose={() => setSelectedProduct(null)}
            onAddToCart={addToCart}
            onIncrement={() => incrementCartItem(selectedProduct.name)}
            onDecrement={() => decrementCartItem(selectedProduct.name)}
          />
        ) : viewedOrder ? (
          <OrderDetailView
            onReviewSaved={refreshOrders}
            order={viewedOrder}
            onBack={() => {
              setViewedOrderId(null);
              setIsOrdersPanelOpen(true);
            }}
            onRequestReturn={(reason) => requestReturn(viewedOrder, reason)}
            isRequestingReturn={isRequestingReturn}
            returnRequestError={returnRequestError}
            onRequestPartialReturn={(reason, lines) => requestPartialReturn(viewedOrder, reason, lines)}
            isRequestingPartialReturn={isRequestingPartialReturn}
            partialReturnError={partialReturnError}
            onCancelOrder={() => cancelOrder(viewedOrder)}
            isCancellingOrder={isCancellingOrder}
            cancelOrderError={cancelOrderError}
          />
        ) : isOrdersPanelOpen ? (
          <OrdersListPage
            orders={orders}
            onOpenOrder={(orderId) => {
              setViewedOrderId(orderId);
              setIsOrdersPanelOpen(false);
            }}
            onReorder={handleReorderOrder}
          />
        ) : selectedModel || isBrowsingAllBikes ? (
          <CatalogView
            products={products}
            selectedBrand={selectedBrandData}
            selectedModel={selectedModel ?? ""}
            selectedYear={selectedYear}
            activeCategory={activeCategory}
            modelImage={modelImage}
            selectedProduct={selectedProduct}
            onModelClick={openModelModal}
            onYearChange={setSelectedYear}
            onCategoryChange={setActiveCategory}
            onProductSelect={setSelectedProduct}
            onAddToCart={addToCart}
            cart={cart}
            onIncrementCartItem={incrementCartItem}
            onDecrementCartItem={decrementCartItem}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
          />
        ) : (
          <>
        <section className="relative min-h-[620px] overflow-hidden bg-zinc-950 text-white lg:min-h-[calc(100vh-96px)]">
          <Image
            src="/assets/home/bike-parts-hero.png"
            alt="Motorcycle with spare parts"
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.7)_0%,rgba(2,6,23,0.45)_35%,rgba(2,6,23,0.08)_72%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0)_68%,rgba(2,6,23,0.62)_100%)]" />

          <div className="relative z-10 mx-auto flex min-h-[620px] w-full max-w-[1520px] flex-col px-4 py-6 sm:px-6 lg:min-h-[calc(100vh-96px)] lg:px-14 lg:py-14">
            <div className="grid flex-1 items-center gap-8 lg:grid-cols-[380px_minmax(420px,1fr)]">
              <div className="rounded-lg bg-white p-5 text-zinc-950 shadow-[0_24px_70px_rgba(2,6,23,0.28)] ring-1 ring-white/70 sm:p-6">
                <h1 className="text-3xl font-black leading-[1.02] text-zinc-950 sm:text-4xl">
                  Find the Right{" "}
                  <span className="block text-[#025632]">Bike Parts</span>
                </h1>
                <p className="mt-3 max-w-sm text-sm font-medium leading-6 text-zinc-600 sm:text-base">
                  Select your bike brand and model to find compatible genuine parts
                </p>

                <div className="mt-5">
                  <button
                    type="button"
                    onClick={handleHeroSearch}
                    className="flex h-12 w-full items-center justify-center rounded-lg bg-[#025632] text-xl font-black text-white shadow-[0_18px_34px_rgba(2, 86, 50,0.3)] transition hover:bg-[#013720]"
                  >
                    Select Bike
                  </button>

                  {lastBikeSelection ? (
                    <button
                      type="button"
                      onClick={resumeLastBike}
                      className="mt-3 flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-left transition hover:border-zinc-300 hover:bg-zinc-50"
                    >
                      <span className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                          Continue with
                        </span>
                        <span className="block truncate text-sm font-black text-zinc-950">
                          {lastBikeSelection.brand} {lastBikeSelection.model}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-zinc-400" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="max-w-lg justify-self-start text-white lg:ml-3">
                <span className="inline-flex rounded-full bg-[#025632] px-3.5 py-1.5 text-xs font-black uppercase leading-none text-white">
                  Genuine Parts
                </span>
                <p className="mt-3 max-w-lg text-4xl font-black uppercase italic leading-[0.98] sm:text-5xl lg:text-6xl">
                  Keep Your Ride{" "}
                  <span className="block text-[#025632]">On The Road</span>
                </p>
                <span className="mt-4 block h-0.5 w-12 bg-[#025632]" />
                <p className="mt-4 text-base font-medium leading-7 text-white/95 sm:text-lg">
                  Quality Parts. Better Performance.
                  <span className="block">For Every Ride.</span>
                </p>
                <button
                  type="button"
                  onClick={() => handleBrowseCategory("")}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-white bg-zinc-950/20 px-5 text-sm font-black text-white backdrop-blur-sm transition hover:bg-white hover:text-zinc-950"
                >
                  Shop Now
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </div>

          </div>
        </section>

        <section className="relative overflow-hidden bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 py-16 sm:py-20">
          <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-14">
            <div className="text-center">
              <h2 className="text-3xl font-black text-white sm:text-4xl">
                Choose Your <span className="text-[#025632]">Bike Brand</span>
              </h2>
              <p className="mt-2 text-sm text-zinc-400 sm:text-base">
                To find compatible parts
              </p>
            </div>

            <div
              className="relative mt-12 flex h-[400px] items-center justify-center overflow-hidden sm:h-[520px]"
              style={{ perspective: "2800px" }}
            >
              <button
                type="button"
                onClick={prevBrandSlide}
                aria-label="Previous brand"
                className="absolute left-0 z-40 grid size-11 shrink-0 place-items-center rounded-full border border-white/20 bg-white/5 text-white backdrop-blur transition hover:bg-white/15 sm:left-2"
              >
                <ChevronLeft className="size-5" />
              </button>

              <button
                type="button"
                onClick={nextBrandSlide}
                aria-label="Next brand"
                className="absolute right-0 z-40 grid size-11 shrink-0 place-items-center rounded-full border border-white/20 bg-white/5 text-white backdrop-blur transition hover:bg-white/15 sm:right-2"
              >
                <ChevronRight className="size-5" />
              </button>

              {carouselBrands.map((brand, index) => {
                // Circular strip: wrap to whichever side is the shorter hop from
                // the featured card, so every brand — including the ones at the
                // ends of brandCarouselOrder — always fans out on both sides
                // instead of piling up lopsided on one side.
                let offset = index - activeBrandSlide;
                if (offset > carouselBrands.length / 2) offset -= carouselBrands.length;
                if (offset < -carouselBrands.length / 2) offset += carouselBrands.length;

                const isActive = offset === 0;
                const distance = Math.abs(offset);
                // Non-linear spacing: tight next to the center card (so its flat edge
                // doesn't reveal a gap past the neighbor's rotated edge) but widening
                // further out, so distant cards don't overlap into illegible text.
                const cardSpacingSteps = [0, 145, 255, 355, 450, 550, 655, 765, 880, 1000, 1125, 1255];
                const translateX = Math.sign(offset) * cardSpacingSteps[Math.min(distance, cardSpacingSteps.length - 1)];
                const translateY = isActive ? -16 : distance * 6;
                const scale = isActive ? 1 : Math.max(0.6, 1 - distance * 0.095);
                const rotateY = offset * -3;
                const opacity = isActive ? 1 : Math.max(0.32, 1 - distance * 0.14);

                return (
                  <button
                    type="button"
                    key={brand.name}
                    onClick={() => (isActive ? selectBrand(brand.name) : goToBrandSlide(index))}
                    aria-label={`${isActive ? "Shop" : "Show"} ${brand.name}`}
                    className="absolute h-[340px] w-[190px] shrink-0 overflow-hidden rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.55)] transition-[transform,opacity] duration-500 ease-out sm:h-[440px] sm:w-[246px]"
                    style={{
                      transform: `translate(${translateX}px, ${translateY}px) scale(${scale}) rotateY(${rotateY}deg)`,
                      opacity,
                      zIndex: 20 - distance,
                    }}
                  >
                    <Image
                      src={brand.card}
                      alt={`${brand.name} — ${brand.tagline}`}
                      fill
                      sizes="246px"
                      className="object-cover"
                      priority={distance <= 1}
                    />
                    {!isActive ? <span className="absolute inset-0 bg-zinc-950/25" /> : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              {carouselBrands.map((brand, index) => (
                <button
                  type="button"
                  key={brand.name}
                  onClick={() => goToBrandSlide(index)}
                  aria-label={`Go to ${brand.name}`}
                  className={`h-1.5 rounded-full transition-all ${
                    index === activeBrandSlide ? "w-6 bg-[#025632]" : "w-1.5 bg-white/25 hover:bg-white/40"
                  }`}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto mt-8 w-full max-w-[1320px] px-4 sm:px-5 lg:px-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-11">
            {categories.map((category) => (
              <button
                type="button"
                key={category.title}
                onClick={() => handleBrowseCategory(category.title)}
                className="group flex min-h-[140px] flex-col justify-between rounded-lg border border-zinc-200 bg-white p-2 text-center shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
              >
                <div className="relative mx-auto h-16 w-full">
                  <Image
                    src={category.image}
                    alt={category.title}
                    width={400}
                    height={300}
                    className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
                  />
                </div>

                <div>
                  <span className="block text-xs font-bold text-zinc-900">
                    {category.title}
                  </span>

                  <span className="mt-1 block text-[10px] leading-3 text-zinc-500 line-clamp-2">
                    {category.detail}
                  </span>
                </div>
              </button>
            ))}

            {/* All Categories Card */}
            <button
              type="button"
              onClick={() => handleBrowseCategory("")}
              className="group flex min-h-[140px] flex-col justify-between rounded-lg border border-zinc-200 bg-white p-2 text-center shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
            >
              <div className="relative grid h-16 place-items-center">
                <span className="absolute grid size-6 -translate-x-8 -translate-y-3 place-items-center rounded-full bg-[#e9fef5]">
                  <Search className="size-3" />
                </span>

                <span className="absolute grid size-6 translate-x-8 -translate-y-3 place-items-center rounded-full bg-[#f4f0ff]">
                  <PackageCheck className="size-3" />
                </span>

                <span className="absolute grid size-6 -translate-x-8 translate-y-4 place-items-center rounded-full bg-[#f0fbf6]">
                  <Zap className="size-3" />
                </span>

                <span className="absolute grid size-6 translate-x-8 translate-y-4 place-items-center rounded-full bg-[#f4f4f5]">
                  <Wrench className="size-3" />
                </span>

                <span className="grid size-12 place-items-center rounded-lg bg-[#efc68f] text-zinc-950 shadow-sm">
                  <Settings className="size-4" />
                </span>
              </div>

              <div>
                <span className="block text-xs font-bold">
                  All Categories
                </span>

                <span className="mt-1 block text-[10px] leading-3 text-zinc-500">
                  Explore All Parts
                </span>
              </div>
            </button>
          </div>
        </section>

        <section className="mx-auto mt-8 w-full max-w-[1520px] px-4 sm:px-6 lg:px-14">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-black text-[#070e2b] sm:text-xl">Best Sellers</h2>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => scrollProductStrip(bestSellerScrollerRef, "left")}
                aria-label="Scroll best sellers left"
                className="grid size-9 place-items-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-950"
              >
                <ChevronLeft className="size-4.5" />
              </button>

              <button
                type="button"
                onClick={() => scrollProductStrip(bestSellerScrollerRef, "right")}
                aria-label="Scroll best sellers right"
                className="grid size-9 place-items-center rounded-full bg-zinc-200 text-zinc-950 transition hover:bg-zinc-300"
              >
                <ChevronRight className="size-4.5" />
              </button>
            </div>
          </div>

          <div
            ref={bestSellerScrollerRef}
            className="no-scrollbar grid auto-cols-[calc((100%_-_20px)/1.5)] grid-flow-col grid-rows-2 gap-x-5 gap-y-6 overflow-x-auto scroll-smooth pb-2 sm:auto-cols-[calc((100%_-_40px)/2.5)] lg:auto-cols-[calc((100%_-_80px)/4.5)]"
          >
            {bestSellerProducts.map((product) => {
              const meta = getProductDisplayMeta(products, product);
              return (
                <ProductCard
                  key={product.name}
                  product={product}
                  isSelected={false}
                  compatibleWith="All Bike Models"
                  quantity={cart[product.name] ?? 0}
                  onSelect={() => setSelectedProduct(product)}
                  onAddToCart={() => addToCart(product, 1)}
                  onIncrement={() => incrementCartItem(product.name)}
                  onDecrement={() => decrementCartItem(product.name)}
                  deliveryDays={meta.deliveryDays}
                  offerLabel={meta.offerLabel}
                />
              );
            })}
          </div>
        </section>

        <section className="mx-auto mt-8 w-full max-w-[1520px] px-4 sm:px-6 lg:px-14">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-black text-[#070e2b] sm:text-xl">New Arrivals</h2>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => scrollProductStrip(newArrivalScrollerRef, "left")}
                aria-label="Scroll new arrivals left"
                className="grid size-9 place-items-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-950"
              >
                <ChevronLeft className="size-4.5" />
              </button>

              <button
                type="button"
                onClick={() => scrollProductStrip(newArrivalScrollerRef, "right")}
                aria-label="Scroll new arrivals right"
                className="grid size-9 place-items-center rounded-full bg-zinc-200 text-zinc-950 transition hover:bg-zinc-300"
              >
                <ChevronRight className="size-4.5" />
              </button>
            </div>
          </div>

          <div
            ref={newArrivalScrollerRef}
            className="no-scrollbar grid auto-cols-[calc((100%_-_20px)/1.5)] grid-flow-col grid-rows-2 gap-x-5 gap-y-6 overflow-x-auto scroll-smooth pb-2 sm:auto-cols-[calc((100%_-_40px)/2.5)] lg:auto-cols-[calc((100%_-_80px)/4.5)]"
          >
            {newArrivalProducts.map((product) => {
              const meta = getProductDisplayMeta(products, product);
              return (
                <ProductCard
                  key={product.name}
                  product={product}
                  isSelected={false}
                  compatibleWith="All Bike Models"
                  quantity={cart[product.name] ?? 0}
                  onSelect={() => setSelectedProduct(product)}
                  onAddToCart={() => addToCart(product, 1)}
                  onIncrement={() => incrementCartItem(product.name)}
                  onDecrement={() => decrementCartItem(product.name)}
                  deliveryDays={meta.deliveryDays}
                  offerLabel={meta.offerLabel}
                />
              );
            })}
          </div>
        </section>
          </>
        )}

      </div>

      {!selectedModel ? (
      <footer className="mt-12 hidden border-t border-zinc-200 bg-zinc-50 lg:block">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="grid gap-10 lg:grid-cols-5">

            {/* Brand */}
            <div>
              <button
                type="button"
                onClick={handleGoHome}
                className="flex items-center text-left"
              >
                <Image
                  src="/deep-logo-trimmed.png"
                  alt="Deep Automobiles"
                  width={1500}
                  height={837}
                  className="h-14 w-auto object-contain"
                />
              </button>

              <p className="mt-5 text-xs text-zinc-500">
                &copy; 2026 Deep Automobiles Ltd.
              </p>
              <a
                href="https://www.sharpflux.com/"
                target="_blank"
                rel="noreferrer"
                className="mt-1 block text-xs text-zinc-500 transition hover:text-[#025632]"
              >
                Developed by SharpFlux Technologies
              </a>
            </div>

            {/* Company */}
            <div>
              <h3 className="text-sm font-black text-zinc-950">Company</h3>

              <ul className="mt-4 space-y-3 text-sm text-zinc-600">
                <li>
                  <button type="button" onClick={handleGoHome} className="text-left transition hover:text-zinc-950">
                    Home
                  </button>
                </li>
                <li><a href="#" className="transition hover:text-zinc-950">About Us</a></li>
                <li><a href="#" className="transition hover:text-zinc-950">Careers</a></li>
                <li><a href="#" className="transition hover:text-zinc-950">Team</a></li>
                <li><a href="#" className="transition hover:text-zinc-950">Deep Seller Hub</a></li>
              </ul>
            </div>

            {/* Contact us + Legal */}
            <div>
              <h3 className="text-sm font-black text-zinc-950">Contact Us</h3>

              <ul className="mt-4 space-y-3 text-sm text-zinc-600">
                <li><a href="#" className="transition hover:text-zinc-950">Help &amp; Support</a></li>
                <li><a href="#" className="transition hover:text-zinc-950">Partner With Us</a></li>
                <li><a href="#" className="transition hover:text-zinc-950">Sell Your Parts</a></li>
              </ul>

              <h3 className="mt-8 text-sm font-black text-zinc-950">Legal</h3>

              <ul className="mt-4 space-y-3 text-sm text-zinc-600">
                <li><a href="#" className="transition hover:text-zinc-950">Terms &amp; Conditions</a></li>
                <li><a href="#" className="transition hover:text-zinc-950">Cookie Policy</a></li>
                <li><a href="#" className="transition hover:text-zinc-950">Privacy Policy</a></li>
              </ul>
            </div>

            {/* Available in */}
            <div>
              <h3 className="text-sm font-black text-zinc-950">Available In</h3>

              <ul className="mt-4 space-y-3 text-sm text-zinc-600">
                {footerCities.map((city) => (
                  <li key={city}>{city}</li>
                ))}
              </ul>

              <button
                type="button"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 shadow-sm transition hover:border-zinc-400"
              >
                50+ cities
                <ChevronDown className="size-3.5" />
              </button>
            </div>

            {/* Explore + Social */}
            <div>
              <h3 className="text-sm font-black text-zinc-950">Explore</h3>

              <ul className="mt-4 space-y-3 text-sm text-zinc-600">
                <li><a href="#" className="transition hover:text-zinc-950">Track Order</a></li>
                <li><a href="#" className="transition hover:text-zinc-950">Offers &amp; Deals</a></li>
                <li><a href="#" className="transition hover:text-zinc-950">Bike Fitment Guide</a></li>
              </ul>

              <h3 className="mt-8 text-sm font-black text-zinc-950">Social Links</h3>

              <div className="mt-4 flex gap-3">
                {footerSocialLinks.map((social) => (
                  <a
                    key={social.name}
                    href="#"
                    aria-label={social.name}
                    className="grid size-9 place-items-center rounded-full border border-zinc-300 bg-white text-zinc-600 transition hover:border-zinc-950 hover:text-zinc-950"
                  >
                    <SocialIcon type={social.icon} />
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom */}
          <div className="mt-10 border-t border-zinc-200 pt-8">
            <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
              <p className="text-lg font-black text-zinc-950 sm:text-xl">
                For a better experience, download the Deep Automobiles app now
              </p>

              <div className="flex shrink-0 gap-3">
                <a
                  href="#"
                  className="flex h-11 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-white transition hover:bg-zinc-800"
                >
                  <Apple className="size-6" />
                  <span className="leading-tight">
                    <span className="block text-[9px] text-zinc-300">Download on the</span>
                    <span className="block text-sm font-bold">App Store</span>
                  </span>
                </a>

                <a
                  href="#"
                  className="flex h-11 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-white transition hover:bg-zinc-800"
                >
                  <Play className="size-5 fill-current" />
                  <span className="leading-tight">
                    <span className="block text-[9px] text-zinc-300">GET IT ON</span>
                    <span className="block text-sm font-bold">Google Play</span>
                  </span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
      ) : null}
      <BrandSelectionModal
        isOpen={isBrandModalOpen}
        selectedBrand={selectedBrand}
        filteredBrands={filteredBrands}
        onClose={() => setIsBrandModalOpen(false)}
        onSelect={selectBrand}
      />
      <ModelSelectionModal
        isOpen={isModelModalOpen}
        selectedBrand={selectedBrandData}
        selectedModel={selectedModel}
        filteredModels={filteredModels}
        onClose={() => setIsModelModalOpen(false)}
        onBack={openBrandModal}
        onSelect={selectModel}
      />

      {null}

      <BikePartsModal
        isOpen={isPartsModalOpen}
        selectedBrand={selectedBrandData}
        selectedModel={selectedModel ?? ""}
        selectedYear={selectedYear}
        modelImage={modelImage}
        onClose={() => setIsPartsModalOpen(false)}
        onChangeBike={() => {
          setIsPartsModalOpen(false);
          openModelModal();
        }}
        onSelectPart={handleSelectBikePart}
      />

      {cartCount > 0 && !isCartOpen && !isAccountMenuOpen && !isSelectionModalOpen ? (
        <button
          type="button"
          onClick={openCart}
          className={`fixed inset-x-4 z-[55] flex items-center justify-between gap-2 rounded-xl bg-zinc-950 px-3 py-2 text-white shadow-[0_10px_30px_rgba(0,0,0,0.4)] transition hover:bg-zinc-800 lg:hidden ${
            isRightPanelOpen ? "bottom-4" : "bottom-20"
          }`}
        >
          <span className="flex min-w-0 items-center gap-2 text-left">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/15">
              <ShoppingCart className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-medium text-white/80">
                {cartCount} {cartCount === 1 ? "item" : "items"}
              </span>
              <span className="block text-xs font-black">
                &#8377;{formatPrice(cartSubtotal)}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs font-bold">
            View Cart
            <ArrowRight className="size-3.5" />
          </span>
        </button>
      ) : null}


      <CartDrawer
        isOpen={isCartOpen}
        items={cartItems}
        isAuthenticated={isAuthenticated}
        addressId={selectedAddressId}
        notice={cartNotice}
        onDismissNotice={() => setCartNotice(null)}
        onClose={() => setIsCartOpen(false)}
        onIncrement={incrementCartItem}
        onDecrement={decrementCartItem}
        onRemove={removeCartItem}
        onProceedToLogin={() => setIsLoginModalOpen(true)}
        onCheckout={() => openAddressPanel("checkout")}
      />

      {isLoginModalOpen ? (
        <LoginModal
          onClose={() => setIsLoginModalOpen(false)}
          onRequestOtp={requestCustomerOtp}
          onVerifyOtp={verifyCustomerOtp}
          onLoginSuccess={(phone) => {
            setIsAuthenticated(true);
            setAuthPhone(phone);
            setIsLoginModalOpen(false);
            void refreshOrders();
          }}
        />
      ) : null}

      <AddressPanel
        isOpen={isAddressPanelOpen}
        mode={addressPanelMode}
        addresses={addresses}
        selectedAddressId={selectedAddressId}
        onSelectAddress={handleSelectDeliveryAddress}
        onClose={() => setIsAddressPanelOpen(false)}
        onBack={() => {
          setIsAddressPanelOpen(false);
          openCart();
        }}
        onAddNew={() => {
          setEditingAddressId(null);
          setAddressFormError(null);
          setIsAddressFormOpen(true);
        }}
        onEdit={(id) => {
          setEditingAddressId(id);
          setAddressFormError(null);
          setIsAddressFormOpen(true);
        }}
        onSetDefault={handleSetDefaultAddress}
      />

      {isAddressFormOpen ? (
        <AddressFormModal
          initialAddress={
            editingAddressId
              ? addresses.find((address) => address.id === editingAddressId) ?? null
              : null
          }
          onClose={() => {
            setIsAddressFormOpen(false);
            setEditingAddressId(null);
            setAddressFormError(null);
          }}
          onSave={handleSaveAddress}
          onDelete={handleDeleteAddress}
          isSaving={isSavingAddress}
          error={addressFormError}
        />
      ) : null}

      {isCheckingOut ? (
        <div className="fixed inset-x-0 top-4 z-[80] flex justify-center px-4">
          <span className="flex items-center gap-2 rounded-full bg-zinc-950 px-4 py-2 text-xs font-bold text-white shadow-lg">
            <Loader2 className="size-3.5 animate-spin" />
            Preparing secure payment…
          </span>
        </div>
      ) : null}

      {cartNotice && !isCartOpen ? (
        // A stock-limit warning from adding/incrementing a product straight
        // from the catalog grid (cart closed) — CartDrawer only shows this
        // notice inside itself, so without this the customer got silent,
        // unexplained quantity-clamping with no feedback at all until they
        // happened to open the cart.
        <div className="fixed inset-x-0 bottom-6 z-[80] flex justify-center px-4">
          <span className="flex max-w-sm items-center gap-3 rounded-full bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg">
            {cartNotice}
            <button
              type="button"
              onClick={() => setCartNotice(null)}
              aria-label="Dismiss"
              className="grid size-4 shrink-0 place-items-center rounded-full bg-white/20 hover:bg-white/30"
            >
              <X className="size-2.5" />
            </button>
          </span>
        </div>
      ) : null}

      {checkoutError ? (
        <div className="fixed inset-x-0 bottom-6 z-[80] flex justify-center px-4">
          <span className="flex max-w-sm items-center gap-3 rounded-full bg-red-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg">
            {checkoutError}
            <button
              type="button"
              onClick={() => setCheckoutError(null)}
              aria-label="Dismiss"
              className="grid size-4 shrink-0 place-items-center rounded-full bg-white/20 hover:bg-white/30"
            >
              <X className="size-2.5" />
            </button>
          </span>
        </div>
      ) : null}
    </main>
  );
}
