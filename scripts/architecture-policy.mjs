// Main and Agent Host share Node capabilities through shared/node. Shared and
// contract modules never import process-specific business modules. Renderer
// runtime paths must stay free of Node modules, even through shared barrels.
export const architecturePolicy = {
  // An exception, when necessary, must name an exact rule/from/to edge and
  // provide both reason and removeWhen. Wildcards and unused exceptions fail.
  exceptions: [],
};
