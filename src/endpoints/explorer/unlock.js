import express from 'express';
import { Config } from '../../utils/config.js';
import * as DB from '../../utils/db.js';
import * as Util from '../../utils/helper.js';
import * as Web from '../../utils/web.js';

const useRelay = Config.app.relay.server;
const useWebSource = Config.app.flag.enable_web_source;

var router = express.Router();

router.get('/', async function (req, res, next) {
    const lensId = req?.query?.uid && parseInt(req.query.uid) || false;
    if (!lensId) {
        return res.json({});
    }

    const unlock = await DB.getLensUnlock(lensId);
    if (unlock && unlock[0]) {
        // trigger re-download to catch missing files automatically
        await Util.downloadUnlock(unlock[0].lens_id, unlock[0].lens_url);

        return res.json(Util.modifyResponseURLs(unlock[0]));
    } else {
        const remoteUnlock = await getRemoteUnlockByLensId(lensId);
        if (remoteUnlock) {
            return res.json(remoteUnlock);
        }
    }

    return res.json({});
});

async function getRemoteUnlockByLensId(lensId) {
    try {
        if (useRelay) {
            const unlock = await Util.getUnlockFromRelay(lensId);
            if (unlock) {
                DB.insertUnlock(unlock);
                return unlock;
            }
        }

        if (useWebSource) {
            let lens = Web.Cache.get(lensId);
            if (!lens || !lens.uuid) {
                lens = await DB.getSingleLens(lensId);
                if (lens && lens[0]) {
                    lens = lens[0];
                }
            }

            if (lens && lens.uuid) {
                const unlockLensCombined = await Web.getUnlockByHash(lens.uuid);
                if (unlockLensCombined) {
                    DB.insertLens(unlockLensCombined);
                    DB.insertUnlock(unlockLensCombined);
                    return unlockLensCombined;
                }
            }
        }
    } catch (e) {
        console.error(e);
    }

    return null;
}

export default router;