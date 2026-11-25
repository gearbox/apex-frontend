import type { ThemeName } from '$lib/themes';
import { ROUTES } from '$lib/utils/routes';
import { NavDestinationId as D, type NavDestinationId } from '$lib/navigation/destinations';
import type { ProductId } from './ids';
import type { Capability } from './capabilities';

export type MobileTabSlot =
  | { readonly kind: 'destination'; readonly id: NavDestinationId }
  | { readonly kind: 'library' }
  | { readonly kind: 'more' };
export interface ProductNavigation {
  readonly desktopMain: readonly NavDestinationId[];
  readonly mobileTabs: readonly MobileTabSlot[];
  readonly moreSheet: readonly NavDestinationId[];
}
export interface ProductHome {
  readonly route: string;
  readonly whenCapable?: { readonly capability: Capability; readonly route: string };
}
export interface ProductProfile {
  readonly id: ProductId;
  readonly home: ProductHome;
  readonly defaultTheme: ThemeName;
  readonly navigation: ProductNavigation;
}
/** Generator-first navigation shared by both products. */
const VEX_NAVIGATION: ProductNavigation = {
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
    home: { route: ROUTES.create },
    defaultTheme: 'slate',
    navigation: VEX_NAVIGATION,
  },
  synthara: {
    id: 'synthara',
    home: { route: ROUTES.create, whenCapable: { capability: 'studio', route: ROUTES.studio } },
    defaultTheme: 'nocturne',
    navigation: {
      desktopMain: [D.Studio, D.Artists, D.Create, D.Library, D.Sessions, D.Jobs, D.Billing],
      mobileTabs: [
        { kind: 'destination', id: D.Studio },
        { kind: 'destination', id: D.Create },
        { kind: 'library' },
        { kind: 'more' },
      ],
      moreSheet: [D.Artists, D.Sessions, D.Billing, D.Jobs, D.Profile],
    },
  },
} as const satisfies Record<ProductId, ProductProfile>;
