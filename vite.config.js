import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    build: {
        target: 'esnext',
        rollupOptions: {
            input: {
                main:           resolve(__dirname, 'index.html'),
                tmIndex:        resolve(__dirname, 'trackmania/index.html'),
                tmCup:          resolve(__dirname, 'trackmania/cup.html'),
                tmOverlayQuals: resolve(__dirname, 'trackmania/overlay-quals.html'),
                tmOverlayFin:   resolve(__dirname, 'trackmania/overlay-finale.html'),
                tmOverlayPod:   resolve(__dirname, 'trackmania/overlay-podium.html'),
                rl:             resolve(__dirname, 'rocket-league/index.html'),
                rlLan:          resolve(__dirname, 'rocket-league/lan.html'),
            }
        }
    }
});
