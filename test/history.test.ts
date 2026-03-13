import { assert } from 'chai';

(global as Record<string, unknown>).window = {
    history: {
        pushState: () => {},
    },
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Router = require('../src/index') as typeof import('../src/index');

describe('Router-History', function () {
    describe('default values', function () {
        const router = new Router();

        it('should return history mode', function () {
            assert.equal('history', router.mode);
        });

        it('should return an empty array', function () {
            assert.equal(0, router.routes.length);
        });

        it('should return `/` as default', function () {
            assert.equal('/', router.root);
        });

        it('should return a callback for notFound', function () {
            assert.isFunction(router.notFoundHandler);
        });
    });

    describe('init values', function () {
        it('should return history mode even for history settings', function () {
            const router = new Router({ mode: 'history' });
            assert.equal('history', router.mode);
        });

        it('should return hash mode even for hash settings', function () {
            const router = new Router({ mode: 'hash' });
            assert.equal('hash', router.mode);
        });
    });
});
