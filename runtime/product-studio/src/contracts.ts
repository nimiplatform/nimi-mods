export const PRODUCT_STUDIO_MOD_ID = 'world.nimi.product-studio';
export const PRODUCT_STUDIO_TAB_ID = 'mod:product-studio';

export const PRODUCT_STUDIO_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const PRODUCT_STUDIO_ROUTE_SLOT = 'ui-extension.app.content.routes';

export const PRODUCT_STUDIO_DATA_API_PROJECTS_LIST = 'data-api.product-studio.projects.list';
export const PRODUCT_STUDIO_DATA_API_PROJECTS_GET = 'data-api.product-studio.projects.get';
export const PRODUCT_STUDIO_DATA_API_PROJECTS_CREATE = 'data-api.product-studio.projects.create';
export const PRODUCT_STUDIO_DATA_API_PROJECTS_UPDATE = 'data-api.product-studio.projects.update';
export const PRODUCT_STUDIO_DATA_API_REFERENCES_LIST = 'data-api.product-studio.references.list';
export const PRODUCT_STUDIO_DATA_API_REFERENCES_UPSERT = 'data-api.product-studio.references.upsert';
export const PRODUCT_STUDIO_DATA_API_SCENES_LIST = 'data-api.product-studio.scenes.list';
export const PRODUCT_STUDIO_DATA_API_SCENES_UPSERT = 'data-api.product-studio.scenes.upsert';
export const PRODUCT_STUDIO_DATA_API_SELLING_POINTS_LIST = 'data-api.product-studio.selling-points.list';
export const PRODUCT_STUDIO_DATA_API_SELLING_POINTS_UPSERT = 'data-api.product-studio.selling-points.upsert';
export const PRODUCT_STUDIO_DATA_API_PROMPTS_LIST = 'data-api.product-studio.prompts.list';
export const PRODUCT_STUDIO_DATA_API_PROMPTS_GET = 'data-api.product-studio.prompts.get';
export const PRODUCT_STUDIO_DATA_API_PROMPTS_UPSERT = 'data-api.product-studio.prompts.upsert';
export const PRODUCT_STUDIO_DATA_API_BATCHES_LIST = 'data-api.product-studio.batches.list';
export const PRODUCT_STUDIO_DATA_API_BATCHES_GET = 'data-api.product-studio.batches.get';
export const PRODUCT_STUDIO_DATA_API_BATCHES_UPSERT = 'data-api.product-studio.batches.upsert';
export const PRODUCT_STUDIO_DATA_API_GALLERY_LIST = 'data-api.product-studio.gallery.list';
export const PRODUCT_STUDIO_DATA_API_GALLERY_GET = 'data-api.product-studio.gallery.get';
export const PRODUCT_STUDIO_DATA_API_GALLERY_UPSERT = 'data-api.product-studio.gallery.upsert';
export const PRODUCT_STUDIO_DATA_API_GALLERY_RATE = 'data-api.product-studio.gallery.rate';

export const PRODUCT_STUDIO_CAPABILITIES = [
  'runtime.ai.text.generate',
  'runtime.ai.text.stream',
  'runtime.media.image.generate',
  'runtime.media.jobs.submit',
  'runtime.media.jobs.get',
  'runtime.media.jobs.cancel',
  'runtime.media.jobs.subscribe',
  'runtime.media.jobs.get.artifacts',
  'runtime.route.list.options',
  'runtime.route.resolve',
  'runtime.route.check.health',
  'storage.sqlite.query',
  'storage.sqlite.execute',
  'storage.files.read',
  'storage.files.write',
  `data.register.${PRODUCT_STUDIO_DATA_API_PROJECTS_LIST}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_PROJECTS_GET}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_PROJECTS_CREATE}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_PROJECTS_UPDATE}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_REFERENCES_LIST}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_REFERENCES_UPSERT}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_SCENES_LIST}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_SCENES_UPSERT}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_SELLING_POINTS_LIST}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_SELLING_POINTS_UPSERT}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_PROMPTS_LIST}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_PROMPTS_GET}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_PROMPTS_UPSERT}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_BATCHES_LIST}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_BATCHES_GET}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_BATCHES_UPSERT}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_GALLERY_LIST}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_GALLERY_GET}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_GALLERY_UPSERT}`,
  `data.register.${PRODUCT_STUDIO_DATA_API_GALLERY_RATE}`,
  `ui.register.${PRODUCT_STUDIO_NAV_SLOT}`,
  `ui.register.${PRODUCT_STUDIO_ROUTE_SLOT}`,
] as const;
