{
  description = "Film Night";

  inputs.nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-darwin" ];
      forAllSystems = f:
        nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in {
      packages = forAllSystems (pkgs: rec {
        filmnight = pkgs.callPackage ./nix/package.nix { };
        default = filmnight;
      });

      # the package runs the suite and the type check in its own checkPhase, so
      # this is the same derivation rather than a second one: `nix flake check`
      # and a deploy ask exactly the same question, and the answer is cached
      checks = forAllSystems (pkgs: {
        filmnight = self.packages.${pkgs.stdenv.hostPlatform.system}.filmnight;
      });
    };
}
