/**
 * Navigation menus, ported 1:1 from the original site's `menu` sqlite table
 * (sites/default/cfg/database.sqlite). Structure (labels, hrefs, ordering,
 * nesting) verified against the live rendered navbar, not just the raw rows.
 */

export interface MenuItem {
  href?: string;
  label: string;
  match?: string;
  children?: MenuItem[];
}

export const genericMenu: MenuItem[] = [
  {
    label: 'This project',
    href: '/ghazni-project',
    children: [
      { label: 'The Ghazni project', href: '/ghazni-project' },
      { label: 'Buddhist Ghazni', href: '/buddhist' },
      { label: 'Islamic Ghazni', href: '/islamic' },
    ],
  },
  { label: 'Italian Archaeological Mission', href: '/archaeological-mission' },
  {
    label: 'Archaeological Sites',
    href: '/archaeological-site',
    children: [
      { label: 'Buddhist sites in Ghazni', href: '/buddhist#sites_and_buildings' },
      { label: 'Islamic sites in Ghazni', href: '/islamic#sites_and_buildings' },
    ],
  },
  { label: 'Blog', href: '/blog/' },
  { label: 'Bibliography', href: '/bibliography' },
  { label: 'Research team', href: '/research-team' },
];

export const islamicMenu: MenuItem[] = [
  { label: 'Islamic Ghazni', href: '/islamic' },
  {
    label: 'Sites and buildings',
    href: '/islamic/sites_buildings',
    children: [
      { label: 'The Ghaznavid palace', href: '/islamic/ghaznavid-palace' },
      { label: 'The house of lustre-wares', href: '/islamic/house-of-lustre-wares' },
      { label: 'Funerary complexes', href: '/islamic/funerary-complexes' },
    ],
  },
  { label: 'Image galleries', href: '/islamic/i_gallery' },
  { label: 'Finds', href: '/islamic/finds' },
  { label: 'Bibliography', href: '/bibliography#islamic' },
  { label: 'Blog', href: '/blog/' },
  { label: 'Research team', href: '/research-team' },
];

export const buddhistMenu: MenuItem[] = [
  {
    label: 'Site and buildings',
    href: '/buddhist#sites_and_buildings',
    children: [{ label: 'Tapa Sardar', href: '/buddhist/the-buddhist-site-of-tapa-sardar' }],
  },
  { label: 'Image galleries', href: '/buddhist/b_gallery' },
  { label: 'Finds', href: '/buddhist/finds' },
  { label: 'Blog', href: '/blog/' },
  { label: 'Bibliography', href: '/bibliography#buddhist' },
  { label: 'Research team', href: '/research-team' },
];

export const genericFooterMenu: MenuItem[] = [
  { label: 'The project', href: '/ghazni-project' },
  { label: 'The Italian Archaeological Mission', href: '/archaeological-mission' },
  { label: 'Archaeological sites', href: '/archaeological-site' },
  { label: 'Blog', href: '/blog/' },
  { label: 'Bibliography', href: '/bibliography' },
  { label: 'Research team', href: '/research-team' },
];

export const islamicFooterMenu: MenuItem[] = [
  { label: 'Site and buildings', href: '/islamic#sites_and_buildings' },
  { label: 'Image gallery', href: '/islamic/i_gallery' },
  { label: 'Finds', href: '/islamic/finds' },
  { label: '3D Models', href: '/islamic#3d-models' },
];

export const buddhistFooterMenu: MenuItem[] = [
  { label: 'Site and buildings', href: '/buddhist#sites_and_buildings' },
  { label: 'Image gallery', href: '/buddhist/b_gallery' },
  { label: 'Finds', href: '/buddhist/finds' },
  { label: '3D view', href: '/buddhist#3d_view' },
];

export type Domain = 'islamic' | 'buddhist' | undefined;

export function menuForDomain(domain: Domain): MenuItem[] {
  if (domain === 'islamic') return islamicMenu;
  if (domain === 'buddhist') return buddhistMenu;
  return genericMenu;
}
