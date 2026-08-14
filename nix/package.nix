{ lib, buildNpmPackage, nodejs_24, python3 }:

buildNpmPackage {
  pname = "filmnight";
  version = "1.0.0";

  # the store is world readable, so ship only what the build reads: no README
  # (it points at the identity links), no prototypes, no tests
  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../src
      ../static
      ../scripts
      ../package.json
      ../package-lock.json
      ../tsconfig.json
      ../vite.config.ts
      ../.npmrc
    ];
  };

  npmDepsHash = "sha256-+RRoXdEEEB0G6EP1tpC1aWmqVmPXL7l0BS8hcCTtCDg=";

  # the service runs this exact node, so the better-sqlite3 built here keeps its ABI
  nodejs = nodejs_24;

  # no network in the sandbox, so prebuild-install falls through to node-gyp
  nativeBuildInputs = [ python3 ];

  # seeding is still a hand-run job on the server, and it needs a bundle
  postBuild = "npm run build:seed";

  # adapter-node leaves better-sqlite3 and qrcode as runtime imports, so the
  # production tree has to travel with the build
  installPhase = ''
    runHook preInstall

    npm prune --omit=dev
    mkdir -p $out/lib/filmnight
    cp -r build node_modules package.json $out/lib/filmnight/
    cp .seed/seed.mjs $out/lib/filmnight/seed.mjs

    runHook postInstall
  '';

  meta = {
    description = "Film Night";
    homepage = "https://film.tymek.me";
    platforms = lib.platforms.unix;
  };
}
