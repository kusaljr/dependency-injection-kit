import "reflect-metadata";

export const REACT_METADATA = Symbol("react:metadata");

export function React() {
  return function (target: any, propertyKey?: string | symbol) {
    if (propertyKey) {
      Reflect.defineMetadata(REACT_METADATA, true, target, propertyKey);
    } else {
      Reflect.defineMetadata(REACT_METADATA, true, target);
    }
  };
}

export interface SeoMeta {
  title?: string;
  description?: string;
  keywords?: string[];
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterCard?: string;
  twitterImage?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  [key: string]: any;
}

export function pageResponse(seo: SeoMeta, data: unknown) {
  const head = {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    ogTitle: seo.ogTitle,
    ogDescription: seo.ogDescription,
    ogImage: seo.ogImage,
    ogUrl: seo.ogUrl,
    twitterCard: seo.twitterCard,
    twitterTitle: seo.twitterTitle,
    twitterDescription: seo.twitterDescription,
    twitterImage: seo.twitterImage,
    ...seo,
  };

  return {
    head,
    data,
  };
}
