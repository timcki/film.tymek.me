{ lib, buildNpmPackage, nodejs_24 }:

buildNpmPackage {
  pname = "filmnight";
  version = "1.0.0";

  # the store is world readable, so ship only what the build reads: no README or
  # docs (they point at the identity links), no prototypes, no tests
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

  npmDepsHash = "sha256-EKPV4E9f2YHdAQmCaI9etYcRX2adwB8/4vaP3hlaSvQ=";

  # picks the node that runs the build and the service. better-sqlite3 is N-API
  # from 13 on and ships its own prebuilt binary, so nothing here is compiled
  # against these headers any more, and no node-gyp (or python) is involved
  nodejs = nodejs_24;

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
