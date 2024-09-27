const exec = require("child_process").execSync;
const crypto = require("crypto");
const fs = require("fs");
const simpleGit = require("simple-git");
const fetch = require("sync-fetch");
(async () => {
  const version = fetch(
    "https://api.github.com/repos/spicetify/cli/tags"
  )
    .json()[0]
    .name.substring(1);
  let filename = `v${version}`;
  exec(
    `curl -Ls https://codeload.github.com/spicetify/cli/tar.gz/${filename} --output ${filename}.tar.gz`
  );
  filename += ".tar.gz";
  console.log("Downloaded", filename);
  tar = fs.readFileSync(filename);
  const hex = crypto.createHash("sha256").update(tar).digest("hex");
  console.log("Hash:", hex);
  fs.unlinkSync(filename);

  const differs = (pattern, file, match) => {
    return file.match(pattern)[0] === match;
  };
  
  const updateAUR = async (version, filename, hex) => {
    if (!fs.existsSync("spicetify-cli"))
      exec("git clone ssh://aur@aur.archlinux.org/spicetify-cli.git");
    const aGit = simpleGit({ baseDir: "spicetify-cli" });
    await aGit.reset("hard", ["origin/master"]);
    await aGit.pull();
    let pkgbuild = fs.readFileSync("spicetify-cli/PKGBUILD").toString();
    let srcinfo = fs.readFileSync("spicetify-cli/.SRCINFO").toString();
    const pkgVerPattern = /(?<=pkgver ?= ?)\d+\.\d+\.\d+/g;
    const pkgRelPattern = /(?<=pkgrel ?= ?)\d+/g;
    const sourcePattern =
      /source ?= ?cli-\d+\.\d+\.\d+\.tar\.gz::https:\/\/github.com\/spicetify\/cli\/archive\/v\d+\.\d+\.\d+\.tar\.gz/g;
    const sha256sumsPattern = /(?<=sha256sums ?= ?(\(')?)[0-9a-f]+(?=('\))?)/g;
    if (
      differs(sha256sumsPattern, pkgbuild, hex) ||
      differs(sha256sumsPattern, srcinfo, hex)
    ) {
      console.log("Identical SHA256", hex);
      return;
    }
    if (
      differs(pkgVerPattern, pkgbuild, version) ||
      differs(pkgVerPattern, srcinfo, version)
    ) {
      console.log("Identical version", version);
      return;
    }
    if (differs(sourcePattern, srcinfo, `source = cli-${version}.tar.gz::https://github.com/spicetify/cli/archive/${filename}`)) {
      console.log(
        "Identical URL",
        "https://github.com/spicetify/cli/archive/" + filename
      );
      return;
    }
    pkgbuild = pkgbuild.replace(sha256sumsPattern, hex);
    pkgbuild = pkgbuild.replace(pkgVerPattern, version);
    pkgbuild = pkgbuild.replace(pkgRelPattern, "1");
    srcinfo = srcinfo.replace(sha256sumsPattern, hex);
    srcinfo = srcinfo.replace(pkgVerPattern, version);
    srcinfo = srcinfo.replace(pkgRelPattern, "1");
    srcinfo = srcinfo.replace(sourcePattern, `source = cli-${version}.tar.gz::https://github.com/spicetify/cli/archive/${filename}`);
    fs.writeFileSync("spicetify-cli/PKGBUILD", pkgbuild);
    fs.writeFileSync("spicetify-cli/.SRCINFO", srcinfo);
    const status = await aGit.status();
    if (
      status.modified.length !== 2 ||
      !(
        status.modified.includes(".SRCINFO") &&
        status.modified.includes("PKGBUILD")
      )
    ) {
      console.log(
        "Git state of spicetify-cli differs from expected value! Try deleting the folder."
      );
      return;
    }
    await aGit.add(".SRCINFO");
    await aGit.add("PKGBUILD");
    await aGit.commit(`bump: v${version}`);
    await aGit.push("origin", "master");
    console.log("AUR done");
  };

  console.log("Updating AUR...");
  updateAUR(version, filename, hex);
})();
