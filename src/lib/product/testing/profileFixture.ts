import { readable } from 'svelte/store';
import type { ProductProfile } from '$lib/product/profiles';

const divergentProfile: ProductProfile = {
  id: 'synthara',
  homeRoute: '/app/library',
  defaultTheme: 'frost',
  navigation: {
    desktopMain: ['billing', 'create'],
    mobileTabs: [{ kind: 'destination', id: 'jobs' }, { kind: 'more' }],
    moreSheet: ['profile'],
  },
};
export const divergentProfileStore = readable(divergentProfile);
