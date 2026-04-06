const crypto = require("crypto");
const fs = require("fs");
const simpleGit = require("simple-git");
const fetch = require("sync-fetch");
const execSync = require("child_process").execSync;

const downloadFile = async (source, targetFile) => {
  try {
    const networkResponse = await fetch(source);
    const dataBuffer = await networkResponse.arrayBuffer();
    fs.writeFileSync(targetFile, Buffer.from(dataBuffer));
  } catch (error) {
    console.error("Fetch operation failed:", error);
    throw error;
  }
};

const doUpdate = async () => {
  console.log("Checking GitHub for the latest stable release...");

  const releaseData = fetch(
    "https://api.github.com/repos/spicetify/cli/releases/latest",
  ).json();

  if (!releaseData || !releaseData.tag_name) {
    console.error("Could not find latest stable release data.");
    return;
  }

  const tagName = releaseData.tag_name;
  const version = tagName.startsWith("v") ? tagName.substring(1) : tagName;

  let filename = `v${version}`;
  const downloadUrl = `https://codeload.github.com/spicetify/cli/tar.gz/${filename}`;
  const localTarball = `${filename}.tar.gz`;

  console.log(`Found stable version: ${version}. Downloading...`);

  await downloadFile(downloadUrl, localTarball);
  console.log("Downloaded", localTarball);

  const tar = fs.readFileSync(localTarball);
  const hex = crypto.createHash("sha256").update(tar).digest("hex");
  console.log("Hash:", hex);

  fs.unlinkSync(localTarball);

  const differs = (pattern, file, match) => {
    const result = file.match(pattern);
    return result && result[0] === match;
  };

  const updateAUR = async (version, filename, hex) => {
    const repoDir = "spicetify-cli";

    if (!fs.existsSync(repoDir)) {
      console.log("Cloning AUR repository...");
      execSync("git clone ssh://aur@aur.archlinux.org/spicetify-cli.git");
    }

    const aGit = simpleGit({ baseDir: repoDir });
    await aGit.reset("hard", ["origin/master"]);
    await aGit.pull();

    let pkgbuild = fs.readFileSync(`${repoDir}/PKGBUILD`).toString();
    let srcinfo = fs.readFileSync(`${repoDir}/.SRCINFO`).toString();

    const pkgVerPattern = /(?<=pkgver ?= ?)[0-9a-z.+~_-]+/gi;
    const pkgRelPattern = /(?<=pkgrel ?= ?)\d+/g;
    const sourcePattern =
      /source ?= ?cli-[0-9a-z.+~_-]+\.tar\.gz::https:\/\/github\.com\/spicetify\/cli\/archive\/v[0-9a-z.+~_-]+\.tar\.gz/gi;
    const sha256sumsPattern = /(?<=sha256sums ?= ?(\(')?)[0-9a-f]+(?=('\))?)/g;

    if (differs(pkgVerPattern, pkgbuild, version)) {
      console.log(`AUR is already at version ${version}. No update needed.`);
      return;
    }

    console.log(`Updating AUR files to v${version}...`);

    pkgbuild = pkgbuild.replace(sha256sumsPattern, hex);
    pkgbuild = pkgbuild.replace(pkgVerPattern, version);
    pkgbuild = pkgbuild.replace(pkgRelPattern, "1");

    srcinfo = srcinfo.replace(sha256sumsPattern, hex);
    srcinfo = srcinfo.replace(pkgVerPattern, version);
    srcinfo = srcinfo.replace(pkgRelPattern, "1");
    srcinfo = srcinfo.replace(
      sourcePattern,
      `source = cli-${version}.tar.gz::https://github.com/spicetify/cli/archive/${filename}`,
    );

    fs.writeFileSync(`${repoDir}/PKGBUILD`, pkgbuild);
    fs.writeFileSync(`${repoDir}/.SRCINFO`, srcinfo);

    const status = await aGit.status();
    if (status.modified.length === 0) {
      console.log("No files were modified. Skipping git push.");
      return;
    }

    await aGit.add([".SRCINFO", "PKGBUILD"]);
    await aGit.commit(`bump: v${version}`);
    await aGit.push("origin", "master");
    console.log("AUR update complete and pushed!");
  };

  console.log("Starting AUR update process...");
  await updateAUR(version, filename, hex);
};

module.exports = doUpdate;
