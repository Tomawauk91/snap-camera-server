import JSZip from 'jszip';
import LensFileParser from '@ptrumpis/snap-lens-file-extractor';
import { Config } from './config.js';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as zstd from 'fzstd';
import * as Storage from './storage.js';
import * as Util from './helper.js';

dotenv.config();

const storageServer = process.env.STORAGE_SERVER;
const storagePath = process.env.STORAGE_PATH;
const mediaDir = process.env.MEDIA_DIR?.replace(/^\/+/, '');
const mediaDirAlt = process.env.MEDIA_DIR_ALT?.replace(/^\/+/, '');
const importDir = process.env.IMPORT_DIR?.replace(/^\/+/, '');

const baseUrl = storageServer?.concat('/', importDir, '/');
const defaultMediaBaseUrl = storageServer?.concat('/', mediaDirAlt, '/');

const allowOverwrite = Config.import.allow_overwrite;
const zipArchive = Config.import.zip_archive;

async function importLensFile(lensFile, lensId, createMediaFiles = true) {
    if (!Util.isLensId(lensId)) {
        console.warn("Can't import lens with invalid lens ID", lensId);
        return false;
    }

    try {
        let result = false;

        const destDirectory = storagePath.concat('/', importDir, '/', lensId);
        if (!(await Storage.isDirectory(destDirectory))) {
            await fs.mkdir(destDirectory, { recursive: true });
        }

        if (await isValidZip(lensFile)) {
            const destFile = destDirectory.concat('/lens.zip');
            if (await copyFile(lensFile, destFile)) {
                result = destFile;
            }
        } else if (zipArchive) {
            const destFile = destDirectory.concat('/lens.zip');
            if (await storeLensAsZip(lensFile, destFile)) {
                result = destFile;
            }
        } else {
            const destFile = destDirectory.concat('/lens.lns');
            if (await copyFile(lensFile, destFile)) {
                result = destFile;
            }
        }

        if (result && createMediaFiles) {
            await copyDefaultMediaFiles(lensId);
        }

        return result;
    } catch (e) {
        console.error(e);
    }

    return false;
}

async function copyFile(srcFile, destFile) {
    try {
        if (allowOverwrite || !(await Storage.isFile(destFile))) {
            await fs.copyFile(srcFile, destFile);
            return true;
        }
    } catch (e) {
        console.error(e);
    }

    return false;
}

async function isValidZip(filePath) {
    try {
        const data = await fs.readFile(filePath);
        await JSZip.loadAsync(data);
        return true;
    } catch {
        return false;
    }
}

async function storeLensAsZip(lensFile, destFile) {
    try {
        const lensFileParser = new LensFileParser();

        let data = await fs.readFile(lensFile);
        const compressedBuffer = data.buffer.slice(data.byteOffset, data.byteLength + data.byteOffset);
        lensFileParser.parseArrayBuffer(compressedBuffer, zstd);

        let zip = new JSZip();
        lensFileParser.files.forEach(function (file) {
            if (file.rawData.length > 0) {
                zip.file(file.fileName.replace(/^\/+/, ''), file.rawData, { createFolders: true });
            }
        });

        if (allowOverwrite || !(await Storage.isFile(destFile))) {
            const lensZip = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", platform: "UNIX" });
            await fs.writeFile(destFile, lensZip, { flag: 'w' });

            return true;
        }
    } catch (e) {
        console.error(e);
    }

    return false;
}

async function copyDefaultMediaFiles(lensId) {
    try {
        const srcDirectory = storagePath.concat('/', mediaDir);
        const destDirectory = storagePath.concat('/', importDir, '/', lensId);

        if (!(await Storage.isDirectory(destDirectory))) {
            await fs.mkdir(destDirectory, { recursive: true });
        }

        // copy all files inside default media directory to import sub directory
        const files = await fs.readdir(srcDirectory);
        for (const file of files) {
            const destFile = destDirectory.concat('/', file);
            if (!(await Storage.isFile(destFile))) {
                await fs.copyFile(srcDirectory.concat('/', file), destFile);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

function importCacheLensesFromSettings(settingsJson, lensFileData = [], updateExisting = false) {
    let lenses = [];
    let unlocks = [];

    try {
        if (settingsJson?.lenses?.cache?.cachedInfo?.length) {
            // extract lens ID and signature
            const info = settingsJson.lenses.cache.cachedInfo;
            for (let i = 0; i < info.length; i++) {
                if (!info[i].lensId || typeof info[i].signature !== 'string') {
                    console.error("Unexpected JSON structure at index", i, info[i]);
                    return false;
                }

                const lensId = parseInt(info[i].lensId);
                const data = lensFileData?.find(item => (item.id === lensId && item.path));
                if (!lensId || !data) {
                    continue;
                }

                const lensFile = data.path.endsWith('.zip') ? baseUrl.concat(lensId, '/lens.zip') : baseUrl.concat(lensId, '/lens.lns');

                let lens = updateExisting ? {
                    unlockable_id: lensId,
                    web_import: 0,
                    custom_import: 0,
                } : {
                    unlockable_id: lensId,
                    snapcode_url: baseUrl.concat(lensId, '/snapcode.png'),
                    user_display_name: "Import",
                    lens_name: lensId,
                    lens_tags: "",
                    lens_status: "Live",
                    deeplink: "",
                    icon_url: baseUrl.concat(lensId, '/icon.png'),
                    thumbnail_media_url: baseUrl.concat(lensId, '/thumbnail.jpg'),
                    // other (unused?) media files will point to default alt media placeholders
                    thumbnail_media_poster_url: defaultMediaBaseUrl.concat('thumbnail_poster.jpg'),
                    standard_media_url: defaultMediaBaseUrl.concat('standard.jpg'),
                    standard_media_poster_url: defaultMediaBaseUrl.concat('standard_poster.jpg'),
                    obfuscated_user_slug: "",
                    image_sequence: {},
                    web_import: 0,
                    custom_import: 0,
                };
                lenses.push(lens);

                let unlock = updateExisting ? {
                    lens_id: lensId,
                    lens_url: lensFile,
                    signature: info[i].signature,
                    web_import: 0,
                    custom_import: 0,
                } : {
                    lens_id: lensId,
                    lens_url: lensFile,
                    signature: info[i].signature,
                    hint_id: "",
                    additional_hint_ids: {},
                    web_import: 0,
                    custom_import: 0,
                };
                unlocks.push(unlock);
            }
        } else {
            console.log("No cached lenses inside settings.json");
            return false;
        }
    } catch (e) {
        console.error(e);
        return false;
    }

    // return database compatible array of objects
    return { lenses, unlocks };
}

function importCustomLensFromWebLens(webLens, lensFilePath, updateExisting = false) {
    if (!webLens || !webLens.unlockable_id) {
        return false;
    }

    if (!Util.isLensId(webLens.unlockable_id)) {
        return false;
    }

    const lensId = webLens.unlockable_id;
    const lensFileUrl = lensFilePath.endsWith('.zip') ? baseUrl.concat(lensId, '/lens.zip') : baseUrl.concat(lensId, '/lens.lns');

    try {
        // return database compatible object
        return updateExisting ? {
            // lens
            unlockable_id: lensId,
            // unlock
            lens_id: lensId,
            lens_url: lensFileUrl,
            // lens & unlock flags
            web_import: 0,
            custom_import: 1,
        } : {
            // lens
            unlockable_id: lensId,
            snapcode_url: webLens.snapcode_url,
            user_display_name: webLens.user_display_name,
            lens_name: webLens.lens_name,
            lens_tags: webLens.lens_tags,
            lens_status: webLens.lens_status,
            deeplink: webLens.deeplink,
            icon_url: webLens.icon_url,
            thumbnail_media_url: webLens.thumbnail_media_url,
            thumbnail_media_poster_url: webLens.thumbnail_media_poster_url,
            standard_media_url: webLens.standard_media_url,
            standard_media_poster_url: webLens.standard_media_poster_url,
            obfuscated_user_slug: webLens.obfuscated_user_slug,
            image_sequence: webLens.image_sequence,
            // unlock
            lens_id: lensId,
            lens_url: lensFileUrl,
            signature: webLens.signature,
            hint_id: webLens.hint_id,
            additional_hint_ids: webLens.additional_hint_ids,
            // lens & unlock flags
            web_import: 0,
            custom_import: 1,
        };
    } catch (e) {
        console.error(e);
    }

    return false;
}

function importCustomLens(lensId, lensFilePath, updateExisting = false) {
    if (!Util.isLensId(lensId)) {
        return false;
    }

    const lensFileUrl = lensFilePath.endsWith('.zip') ? baseUrl.concat(lensId, '/lens.zip') : baseUrl.concat(lensId, '/lens.lns');

    try {
        // return database compatible object
        return updateExisting ? {
            // lens
            unlockable_id: lensId,
            // unlock
            lens_id: lensId,
            lens_url: lensFileUrl,
            // lens & unlock flags
            web_import: 0,
            custom_import: 1,
        } : {
            // lens
            unlockable_id: lensId,
            snapcode_url: baseUrl.concat(lensId, '/snapcode.png'),
            user_display_name: "Import",
            lens_name: lensId,
            lens_tags: "",
            lens_status: "Live",
            deeplink: "",
            icon_url: baseUrl.concat(lensId, '/icon.png'),
            thumbnail_media_url: baseUrl.concat(lensId, '/thumbnail.jpg'),
            thumbnail_media_poster_url: defaultMediaBaseUrl.concat('thumbnail_poster.jpg'),
            standard_media_url: defaultMediaBaseUrl.concat('standard.jpg'),
            standard_media_poster_url: defaultMediaBaseUrl.concat('standard_poster.jpg'),
            obfuscated_user_slug: "",
            image_sequence: {},
            // unlock
            lens_id: lensId,
            lens_url: lensFileUrl,
            signature: "",
            hint_id: "",
            additional_hint_ids: {},
            // lens & unlock flags
            web_import: 0,
            custom_import: 1,
        };
    } catch (e) {
        console.error(e);
    }
}

export { importLensFile, importCacheLensesFromSettings, importCustomLensFromWebLens, importCustomLens };