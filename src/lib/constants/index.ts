import LinkedinIcon from '@/components/ui/icons/linkedin.astro'
import XIcon from '@/components/ui/icons/x.astro'
import GithubIcon from '@/components/ui/icons/github.astro'

export const SOCIAL_LINKS_URLS = {
  github: "https://github.com/aggmoulik",
  linkedin: "https://www.linkedin.com/in/agg-moulik/",
  x: "https://x.com/aggmoulik",
  resume: "https://drive.google.com/file/d/1c7-UIHy8GUvgj2XHuf7nfhUU4vpjRXSt/view?usp=sharing",
} as const;

export const NAV_LINKS = [
  {
    label: "Home",
    href: "/",
  },
  {
    label: "Articles",
    href: "/articles",
  },
  // {
  //   label: "Projects",
  //   href: "/projects",
  // },
] as const;

export const SOCIAL_LINKS = [
  {
    name: 'Github',
    icon: GithubIcon,
    url: SOCIAL_LINKS_URLS.github,
  },
  {
    name: 'Linkedin',
    icon: LinkedinIcon,
    url: SOCIAL_LINKS_URLS.linkedin,
  },
  {
    name: 'X',
    icon: XIcon,
    url: SOCIAL_LINKS_URLS.x,
  },
];