import type { ThemeName } from '$lib/themes';
import { ROUTES } from '$lib/utils/routes';
import { NavDestinationId as D, type NavDestinationId } from '$lib/navigation/destinations';
import type { ProductId } from './ids';

type MobileTabSlot =
  | { readonly kind: 'destination'; readonly id: NavDestinationId }
  | { readonly kind: 'library' }
  | { readonly kind: 'more' };
export interface ProductNavigation {
  readonly desktopMain: readonly NavDestinationId[];
  readonly mobileTabs: readonly MobileTabSlot[];
  readonly moreSheet: readonly NavDestinationId[];
}
export interface ProductProfile {
  readonly id: ProductId;
  readonly homeRoute: string;
  readonly defaultTheme: ThemeName;
  readonly navigation: ProductNavigation;
}
/** Generator-first navigation shared by both products. */
const GENERATOR_NAVIGATION: ProductNavigation = {
  desktopMain: [D.Create, D.Library, D.Sessions, D.Jobs, D.Billing],
  mobileTabs: [
    { kind: 'destination', id: D.Create },
    { kind: 'destination', id: D.Sessions },
    { kind: 'library' },
    { kind: 'more' },
  ],
  moreSheet: [D.Billing, D.Jobs, D.Profile],
};
export const PRODUCT_PROFILES = {
  vex: {
    id: 'vex',
    homeRoute: ROUTES.create,
    defaultTheme: 'slate',
    navigation: GENERATOR_NAVIGATION,
  },
  synthara: {
    id: 'synthara',
    homeRoute: ROUTES.create,
    defaultTheme: 'nocturne',
    navigation: GENERATOR_NAVIGATION,
  },
} as const satisfies Record<ProductId, ProductProfile>;
