import { Config } from './src/utils/config.js';
import { bootstrap } from './src/init.js';
import lenses from './src/endpoints/explorer/lenses.js';
import categorylenses from './src/endpoints/explorer/category/lenses.js';
import top from './src/endpoints/explorer/top.js';
import unlock from './src/endpoints/explorer/unlock.js';
import categories from './src/endpoints/explorer/categories.js';
import scheduled from './src/endpoints/explorer/scheduled.js';
import search from './src/endpoints/explorer/search.js';
import deeplink from './src/endpoints/explorer/deeplink_search.js';
import reporting from './src/endpoints/reporting/lens.js';
import latest from './src/endpoints/update/latest.js';
import download from './src/endpoints/update/download.js';
import importCache from './src/endpoints/import/cache.js';
import importLens from './src/endpoints/import/lens.js';
import v1 from './src/endpoints/v1.js';
import express from 'express';

const enableCacheImport = Config.app.flag.enable_cache_import;
const enableCustomImport = Config.app.flag.enable_custom_import;
const serverPort = process.env.PORT;

const app = express();

app.use(express.json());
app.use('/vc/v1/explorer/lenses', lenses);
app.use('/vc/v1/explorer/category/lenses', categorylenses);
app.use('/vc/v1/explorer/top', top);
app.use('/vc/v1/explorer/unlock', unlock);
app.use('/vc/v1/explorer/categories', categories);
app.use('/vc/v1/explorer/scheduled', scheduled);
app.use('/vc/v1/explorer/search', search);
app.use('/vc/v1/explorer/deeplink_search', deeplink);
app.use('/vc/v1/reporting/lens', reporting);
app.use('/vc/v1/update/latest', latest);
app.use('/vc/v1/update/download', download);
if (enableCacheImport) {
    app.use('/vc/v1/import/cache', importCache);
}
if (enableCustomImport) {
    app.use('/vc/v1/import/lens', importLens);
}
app.use('/vc/v1', v1);
app.listen(serverPort, () => {
    console.info(`[Info] ✅ Snap Camera Server is running on port ${serverPort}`);
    bootstrap();
});
