const exec = require("child_process").execSync;
const crypto = require("crypto");
const fs = require("fs");
const simpleGit = require("simple-git");
const fetch = require("sync-fetch");
(async () => {
  const version = fetch(
    "https://api.github.com/repos/spicetify/spicetify-cli/tags"
  )
    .json()[0]
    .name.substring(1);
  let filename = `v${version}`;
  exec(
    `curl -Ls https://codeload.github.com/spicetify/spicetify-cli/tar.gz/${filename} --output ${filename}.tar.gz`
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

  const updateHomebrew = async (version, filename, hex) => {
    if (!fs.existsSync("homebrew-tap"))
      exec("git clone git@github.com:khanhas/homebrew-tap");
    const hGit = simpleGit({ baseDir: "homebrew-tap" });
    await hGit.reset("hard", ["origin/master"]);
    await hGit.pull();
    let rb = fs.readFileSync("homebrew-tap/spicetify-cli.rb").toString();
    const versionPattern =
      /(?<=url "https:\/\/github.com\/spicetify\/spicetify-cli\/archive\/)v\d+\.\d+\.\d+\.tar\.gz(?=")/g;
    const shaPattern = /(?<=sha256 ")[0-9a-f]+(?=")/g;
    if (differs(shaPattern, rb, hex)) {
      console.log("Identical SHA256", hex);
      return;
    }
    if (differs(versionPattern, rb, filename)) {
      console.log(
        "Identical URL",
        "https://github.com/spicetify/spicetify-cli/archive/" + filename
      );
      return;
    }
    rb = rb.replace(versionPattern, filename);
    rb = rb.replace(shaPattern, hex);
    fs.writeFileSync("homebrew-tap/spicetify-cli.rb", rb);
    const status = await hGit.status();
    if (
      status.modified[0] !== "spicetify-cli.rb" ||
      status.modified.length !== 1
    ) {
      console.log(
        "Git state of homebrew-tap differs from expected value! Try deleting the folder."
      );
      return;
    }
    await hGit.add("spicetify-cli.rb");
    await hGit.commit(`Update to ${version}`);
    await hGit.push("origin", "master");
    console.log("Homebrew done");
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
    const sourcePattern =
      /(?<=source ?= ?https:\/\/github.com\/spicetify\/spicetify-cli\/archive\/)v\d+\.\d+\.\d+\.tar\.gz/g;
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
    if (differs(sourcePattern, srcinfo, filename)) {
      console.log(
        "Identical URL",
        "https://github.com/spicetify/spicetify-cli/archive/" + filename
      );
      return;
    }
    pkgbuild = pkgbuild.replace(sha256sumsPattern, hex);
    pkgbuild = pkgbuild.replace(pkgVerPattern, version);
    srcinfo = srcinfo.replace(sha256sumsPattern, hex);
    srcinfo = srcinfo.replace(pkgVerPattern, version);
    srcinfo = srcinfo.replace(sourcePattern, filename);
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

  console.log("Updating homebrew...");
  updateHomebrew(version, filename, hex);
  console.log("Updating AUR...");
  updateAUR(version, filename, hex);
})();
