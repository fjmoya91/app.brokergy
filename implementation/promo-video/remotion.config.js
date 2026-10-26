// Los componentes que se importan del frontend (iconos, CSS) viven fuera de este
// proyecto: webpack los compila con el JSX clásico, que necesita `React` a mano.
// Se le da el de AQUÍ (una sola copia de React). La config se compila: `__dirname`
// no vale, se corre siempre desde esta carpeta (process.cwd()).
const path = require('path');
const { Config } = require('@remotion/cli/config');
const { webpack } = require('@remotion/bundler');

Config.overrideWebpackConfig((c) => ({
    ...c,
    resolve: { ...c.resolve, alias: { ...(c.resolve?.alias || {}), react: path.resolve(process.cwd(), 'node_modules/react'), 'react-dom': path.resolve(process.cwd(), 'node_modules/react-dom') } },
    plugins: [...(c.plugins || []), new webpack.ProvidePlugin({ React: path.resolve(process.cwd(), 'node_modules/react') })],
}));
