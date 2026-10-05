// Progressive enhancement: without JavaScript (or when the GitHub API is unreachable or rate-limited) every link
// already points at the latest release page. With it, the button links straight to the installer and the page shows
// its version, date, size and SHA-256.
(function () {
  'use strict';
  var REPO = 'etffmc-crypto/dualforge';
  var API = 'https://api.github.com/repos/' + REPO + '/releases/latest';

  function $(id) {
    return document.getElementById(id);
  }

  function formatSize(bytes) {
    return (bytes / 1048576).toFixed(0) + ' MB';
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  /** The hex SHA-256 for `name` from a sha256sum-style file ("<hex>  <name>" per line). */
  function hashFromSums(text, name) {
    var lines = String(text).split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var m = /^([0-9a-f]{64})\s+\*?(.+)$/i.exec(lines[i].trim());
      if (m && m[2] === name) return m[1].toLowerCase();
    }
    return null;
  }

  function showHash(hex) {
    $('sha256').textContent = hex;
    $('checksum').hidden = false;
    var btn = $('copy-sha');
    if (!navigator.clipboard) {
      btn.hidden = true;
      return;
    }
    btn.addEventListener('click', function () {
      navigator.clipboard.writeText(hex).then(
        function () {
          btn.textContent = 'Copied';
          setTimeout(function () {
            btn.textContent = 'Copy';
          }, 1600);
        },
        function () {
          btn.textContent = 'Select and copy';
        },
      );
    });
  }

  function applyRelease(rel) {
    var assets = rel.assets || [];
    var exe = null;
    var sums = null;
    for (var i = 0; i < assets.length; i++) {
      if (/^DualForge-Setup-.*\.exe$/i.test(assets[i].name)) exe = assets[i];
      if (assets[i].name === 'SHA256SUMS.txt') sums = assets[i];
    }
    if (!exe) return; // keep the static link to the release page
    var version = String(rel.tag_name || '').replace(/^v/, '');

    var link = $('download');
    link.href = exe.browser_download_url;

    var parts = ['Version ' + version];
    var date = formatDate(rel.published_at);
    if (date) parts.push(date);
    parts.push(formatSize(exe.size));
    parts.push('Windows 10/11, 64-bit');
    $('release-meta').textContent = parts.join(' · ');

    // GitHub reports a digest per asset; otherwise read SHA256SUMS.txt through the API (which allows CORS).
    var digest = /^sha256:([0-9a-f]{64})$/i.exec(exe.digest || '');
    if (digest) {
      showHash(digest[1].toLowerCase());
    } else if (sums && window.fetch) {
      fetch(sums.url, { headers: { Accept: 'application/octet-stream' } })
        .then(function (r) {
          return r.ok ? r.text() : Promise.reject(new Error(String(r.status)));
        })
        .then(function (text) {
          var hex = hashFromSums(text, exe.name);
          if (hex) showHash(hex);
        })
        .catch(function () {
          /* the static SHA256SUMS.txt link stays */
        });
    }
    if (sums) {
      var a = $('checksum-text').querySelector('a');
      if (a) a.href = sums.browser_download_url;
    }
  }

  if (!window.fetch) return;
  fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (r) {
      return r.ok ? r.json() : Promise.reject(new Error(String(r.status)));
    })
    .then(applyRelease)
    .catch(function () {
      /* offline, rate-limited or no release yet: the static links stay */
    });
})();
