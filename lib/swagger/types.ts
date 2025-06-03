export interface SwaggerOptions {
  [key: string]: any;
  swaggerUrl?: string;
  swaggerUrls?: any[];
  swaggerDoc?: Record<string, any>;
  customOptions?: Record<string, any>;
  oauth?: Record<string, any>;
  preauthorizeApiKey?: {
    authDefinitionKey: string;
    apiKeyValue: string;
  };
  authAction?: Record<string, any>;
}

export interface SwaggerUiOptions {
  swaggerOptions?: SwaggerOptions;
  customCss?: string;
  customJs?: string | string[];
  customJsStr?: string | string[];
  customfavIcon?: string | false;
  customRobots?: string;
  swaggerUrl?: string;
  swaggerUrls?: any[];
  explorer?: boolean;
  customSiteTitle?: string;
  customCssUrl?: string | string[];
}
