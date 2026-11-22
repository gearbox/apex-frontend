import { Activity, Coins, Images, Plus, Server, Shield, User } from '@lucide/svelte';
import * as m from '$paraglide/messages';
import { ROUTES } from '$lib/utils/routes';

export const NavDestinationId = {
  Create: 'create',
  Library: 'library',
  Sessions: 'sessions',
  Jobs: 'jobs',
  Billing: 'billing',
  Profile: 'profile',
  Admin: 'admin',
} as const;
export type NavDestinationId = (typeof NavDestinationId)[keyof typeof NavDestinationId];
type NavIcon = typeof Plus;
interface NavDestination {
  readonly id: NavDestinationId;
  readonly href: string;
  readonly label: () => string;
  readonly sheetLabel: () => string;
  readonly pageTitle: () => string;
  readonly icon: NavIcon;
  readonly isActive: (url: URL) => boolean;
}
const byPrefix = (href: string) => (url: URL) => url.pathname.startsWith(href);
export const NAV_DESTINATIONS = {
  create: {
    id: 'create',
    href: ROUTES.create,
    label: () => m.topbar_create(),
    sheetLabel: () => m.nav_create(),
    pageTitle: () => m.topbar_create(),
    icon: Plus,
    isActive: byPrefix(ROUTES.create),
  },
  library: {
    id: 'library',
    href: ROUTES.library,
    label: () => m.topbar_library(),
    sheetLabel: () => m.library_title(),
    pageTitle: () => m.topbar_library(),
    icon: Images,
    isActive: byPrefix(ROUTES.library),
  },
  sessions: {
    id: 'sessions',
    href: ROUTES.sessions,
    label: () => m.nav_sessions(),
    sheetLabel: () => m.nav_sessions(),
    pageTitle: () => m.nav_sessions(),
    icon: Server,
    isActive: byPrefix(ROUTES.sessions),
  },
  jobs: {
    id: 'jobs',
    href: ROUTES.jobs,
    label: () => m.topbar_jobs(),
    sheetLabel: () => m.nav_jobs(),
    pageTitle: () => m.topbar_jobs(),
    icon: Activity,
    isActive: byPrefix(ROUTES.jobs),
  },
  billing: {
    id: 'billing',
    href: ROUTES.billing,
    label: () => m.topbar_billing(),
    sheetLabel: () => m.nav_billing(),
    pageTitle: () => m.topbar_billing(),
    icon: Coins,
    isActive: byPrefix(ROUTES.billing),
  },
  profile: {
    id: 'profile',
    href: ROUTES.profile,
    label: () => m.topbar_profile(),
    sheetLabel: () => m.nav_profile(),
    pageTitle: () => m.topbar_profile(),
    icon: User,
    isActive: byPrefix(ROUTES.profile),
  },
  admin: {
    id: 'admin',
    href: ROUTES.admin,
    label: () => m.nav_admin(),
    sheetLabel: () => m.nav_admin_panel(),
    pageTitle: () => m.nav_admin_panel(),
    icon: Shield,
    isActive: byPrefix(ROUTES.admin),
  },
} as const satisfies Record<NavDestinationId, NavDestination>;
