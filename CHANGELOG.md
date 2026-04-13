# Changelog

## [2.2.4](https://github.com/shuangwhywhy/ai-quota-guard/compare/v2.2.3...v2.2.4) (2026-04-13)

### Features

* **cli**: add support for dashboard command-line switches (`--dashboard`, `--no-dashboard`) and enable robust argument parsing with delimiter support ([d269cd0f](https://github.com/shuangwhywhy/ai-quota-guard/commit/d269cd0f))

## [2.2.3](https://github.com/shuangwhywhy/ai-quota-guard/compare/v2.2.2...v2.2.3) (2026-04-13)

## [2.2.2](https://github.com/shuangwhywhy/ai-quota-guard/compare/v2.2.1...v2.2.2) (2026-04-13)

## [2.2.1](https://github.com/shuangwhywhy/ai-quota-guard/compare/v2.2.0...v2.2.1) (2026-04-13)

## [2.2.0](https://github.com/shuangwhywhy/ai-quota-guard/compare/v2.1.1...v2.2.0) (2026-04-12)

### Features

* implement pre-release gate with coverage thresholds and integrate into release-it workflow ([0dd37ef](https://github.com/shuangwhywhy/ai-quota-guard/commit/0dd37ef61ca169ce8d6ae53ced1a8b5c2d95a24b))

## [2.1.1](https://github.com/shuangwhywhy/ai-quota-guard/compare/v2.1.0...v2.1.1) (2026-04-12)

## [2.1.0](https://github.com/shuangwhywhy/ai-quota-guard/compare/v2.0.2...v2.1.0) (2026-04-12)

### Features

* enable implicit CLI execution and smart script resolution for commands ([7062288](https://github.com/shuangwhywhy/ai-quota-guard/commit/70622883681c5b1000993322bd83c1cd840c693d))

## [2.0.2](https://github.com/shuangwhywhy/ai-quota-guard/compare/v2.0.1...v2.0.2) (2026-04-12)

## [2.0.1](https://github.com/shuangwhywhy/ai-quota-guard/compare/v2.0.0...v2.0.1) (2026-04-12)

## [2.0.0](https://github.com/shuangwhywhy/ai-quota-guard/compare/v1.12.0...v2.0.0) (2026-04-12)

### Features

* add support for QUOTA_GUARD_CONFIG environment variable and update configuration merge hierarchy ([341d4e7](https://github.com/shuangwhywhy/ai-quota-guard/commit/341d4e7101f03ba9506cbb4c341ac2d261381334))

## [1.12.0](https://github.com/shuangwhywhy/ai-quota-guard/compare/v1.11.2...v1.12.0) (2026-04-12)

### Features

* automate documentation version updates during release and add concurrency control to publish workflow ([b20edc7](https://github.com/shuangwhywhy/ai-quota-guard/commit/b20edc7145c3bd71abffbcd722abfd9d02d2ed56))

## [1.11.2](https://github.com/shuangwhywhy/ai-quota-guard/compare/v1.11.1...v1.11.2) (2026-04-11)

## [1.11.1](https://github.com/shuangwhywhy/ai-quota-guard/compare/v1.11.0...v1.11.1) (2026-04-11)

## [1.11.0](https://github.com/shuangwhywhy/ai-quota-guard/compare/v1.10.0...v1.11.0) (2026-04-11)

### Features

* add workflow_dispatch trigger to sync-wiki workflow ([9ac3629](https://github.com/shuangwhywhy/ai-quota-guard/commit/9ac3629861b93b52bc3ccfb6474c9e21032f955c))

### Bug Fixes

* prevent bundler static scanning of Node-only ClientRequest interceptor via dynamic require and vitest exclusion ([249e10d](https://github.com/shuangwhywhy/ai-quota-guard/commit/249e10dc135218141934c3f6a42b2f62ea47dc1a))

## [1.10.0](https://github.com/shuangwhywhy/ai-quota-guard/compare/v1.9.0...v1.10.0) (2026-04-11)

### Features

* add publish script to package.json for automated releases without version incrementing ([a8d5348](https://github.com/shuangwhywhy/ai-quota-guard/commit/a8d534890f035d87d0b1752aa759e83f7daeff2b))
* add qg docs command to serve and open interactive documentation in the browser ([4d1bbce](https://github.com/shuangwhywhy/ai-quota-guard/commit/4d1bbce9a59390de42b25bc94a098c0dc28a3c20))
* implement 5-level configuration hierarchy with file-based loading and deep merging for Vite and Node environments ([458958c](https://github.com/shuangwhywhy/ai-quota-guard/commit/458958cea160801ee8433402d2cb74d07bf19224))
* implement CLI with init command and add corresponding test suite ([ecc73b6](https://github.com/shuangwhywhy/ai-quota-guard/commit/ecc73b6965cb9f6e66d36f08fc158f6f7ebde202))
* implement interactive documentation site and add comprehensive guides for API, configuration, and diagnostics. ([eba3435](https://github.com/shuangwhywhy/ai-quota-guard/commit/eba34355ff12161744173ddd47e3ec375919102b))

* refactor: improve URL regex matching in pipeline and expand test coverage for registry and browser hardening (e3b87ea)
* test: add diagnostic header assertions, update lifecycle log expectation, and include response_format in semantic key normalization (667d80b)
* docs: refactor README for improved clarity and update configuration documentation (738aab0)
* feat: add response_format to intelligent fields and include X-Quota-Guard status headers in responses (d29eada)
* chore: add environment variable support for release-it and update ignore files (d9f599b)

## [1.9.0](https://github.com/shuangwhywhy/ai-quota-guard/compare/v1.8.0...v1.9.0) (2026-04-11)

### Features

* add response_format to intelligent fields and include X-Quota-Guard status headers in responses ([d29eada](https://github.com/shuangwhywhy/ai-quota-guard/commit/d29eadab6941d9eb97bb6f1be16786f4533039e6))

## [1.8.0](https://github.com/shuangwhywhy/ai-quota-guard/compare/v1.7.1...v1.8.0) (2026-04-11)

### Features

* add new AI endpoints and implement explicit in-flight bypass support with validation tests ([dd82e30](https://github.com/shuangwhywhy/ai-quota-guard/commit/dd82e30ef55ab0dfae9552d8dde13a28eb2e81a5))
* configure vitest workspace for node and browser testing and update node native interception tests to use audit log verification ([e9731f3](https://github.com/shuangwhywhy/ai-quota-guard/commit/e9731f3943419477622b205ceffcecb912f54d09))
* implement Browser (IndexedDB) and File-based cache adapters with associated integration tests ([8dc2a16](https://github.com/shuangwhywhy/ai-quota-guard/commit/8dc2a163dc639be74b5fc91f5e30f848d7c04669))
* implement robust Node.js interceptor injection, add request abort tracking, and introduce in-flight request timeout configuration ([e3f5f3b](https://github.com/shuangwhywhy/ai-quota-guard/commit/e3f5f3b8e7170bbd411f40bc84e4033c5a4bd2df))

## [1.7.1](https://github.com/shuangwhywhy/ai-quota-guard/compare/v1.7.0...v1.7.1) (2026-04-10)

### Bug Fixes

* update NPM and GitHub Packages authentication methods in publish workflow ([a98def4](https://github.com/shuangwhywhy/ai-quota-guard/commit/a98def4e95b617d97d28134b60e2abeb645219c1))
* update npm publish command to use explicit registry authentication via config set ([8897217](https://github.com/shuangwhywhy/ai-quota-guard/commit/8897217497bbf85c258a1c4d6fc91347e90361fe))

## [1.7.0](https://github.com/shuangwhywhy/ai-quota-guard/compare/v1.6.0...v1.7.0) (2026-04-10)

### Features

* add global circuit breaker, support RegExp endpoints, and introduce request lifecycle audit events ([29ffe66](https://github.com/shuangwhywhy/ai-quota-guard/commit/29ffe66ad6197d9b6cd77188a9c581662db81145))

## [1.6.0](https://github.com/shuangwhywhy/ai-quota-guard/compare/v1.4.0...v1.6.0) (2026-04-10)

### Features

* implement diagnostic warnings for fingerprint and intent conflicts with enhanced test coverage ([98248c2](https://github.com/shuangwhywhy/ai-quota-guard/commit/98248c21cfc3add1a9548328e4c038b5da17fe32))
