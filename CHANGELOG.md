# Changelog

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
