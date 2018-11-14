'use strict';

var _ = require('lodash');

var _isArrayObj = function _isArrayObj(val) {
    if (!_.isArray(val)) {
        return true;
    }
    var isObject = false;
    _.each(val, function (doc) {
        return _.isObject(doc) && (isObject = true);
    });
    return isObject;
};

var MongoHelpers = {
    flatten: function flatten(obj) {
        var handler = function handler(obj, copy, keyBase) {
            copy = copy || {};
            keyBase = keyBase || '';
            _.each(obj, function (val, key) {
                var _key = keyBase + ((keyBase ? '.' : '') + key);
                if (_.isObject(val) && !_.isDate(val) && (!_.isArray(val) || _isArrayObj(val))) {
                    _.extend(copy, handler(val, copy, _key));
                    return;
                }
                copy[_key] = val;
            });
            return copy;
        };

        return handler(obj);
    },
    rebuild: function rebuild(flatten) {
        var copy = [];

        _.each(flatten, function (val, key) {
            var paths = key.split('.');
            var levels = [];
            var lastPath = void 0;
            var c = copy;
            paths.forEach(function (path, idx) {
                var pathIsNum = /^\d+$/.test(path);
                if (!pathIsNum && _.isArray(c)) {
                    var o = {};
                    c.forEach(function (v, k) {
                        return o[k] = v;
                    });
                    c = o;
                    if (idx === 0) {
                        copy = o;
                    } else {
                        levels[idx - 1][lastPath] = o;
                    }
                }
                levels.push(c);
                if (idx === paths.length - 1) {
                    return c[path] = val;
                }
                lastPath = path;
                c = c[path] = c[path] || [];
            });
        });
        return copy;
    },
    diffObj: function diffObj(base, mirror) {
        var _ref = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {},
            falsy = _ref.falsy,
            unsetNonProp = _ref.unsetNonProp;

        var callback = arguments[3];

        var self = this;
        var keys = _.keys(base);
        base = self.flatten(base);
        mirror = mirror && self.flatten(_.pick(mirror, keys));
        if (_.isFunction(falsy)) {
            var _ref2 = [falsy, null];
            callback = _ref2[0];
            falsy = _ref2[1];
        }
        falsy = falsy || [null, undefined];
        var isFalsy = function isFalsy(val) {
            return _.includes(falsy, val);
        };

        _.each(base, function (val, key) {
            if (isFalsy(val)) {
                callback({ key: key, val: val, op: 'unset' });
            } else if (!mirror || !_.isEqual(mirror[key], val)) {
                callback({ key: key, val: val, op: 'set' });
            }
        });

        unsetNonProp && mirror && _.each(mirror, function (val, key) {
            if (!base.hasOwnProperty(key) && isFalsy(val)) {
                callback({ key: key, val: val, op: 'unset' });
            }
        });
    },
    diffObject: function diffObject(base, mirror) {
        var _ref3 = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {},
            falsy = _ref3.falsy,
            unsetNonProp = _ref3.unsetNonProp;

        var callback = arguments[3];

        var isNotSimpleArray = function isNotSimpleArray(val) {
            return !_.isArray(val) || _isArrayObj(val);
        };
        var isObject = function isObject(val) {
            return val && _.isObject(val) && !_.isDate(val) && isNotSimpleArray(val);
        };
        var isFalsy = function isFalsy(val) {
            return _.includes(falsy, val);
        };
        var traverse = function traverse(obj, mir, parents, handle) {
            if (!obj) {
                return;
            }
            parents = parents || [];
            obj && _.each(obj, function (val, key) {
                var paths = parents.concat([key]);
                var ov = mir && mir[key];
                if (_.isEqual(val, ov)) {
                    return;
                }
                if (isObject(val) && isObject(ov)) {
                    return traverse(val, ov, paths, handle);
                }
                var objHasKey = obj.hasOwnProperty(key);
                var mirHasKey = mir.hasOwnProperty(key);
                handle(val, ov, key, paths, { obj: obj, mir: mir }, objHasKey, mirHasKey);
            });
        };

        if (_.isFunction(falsy)) {
            var _ref4 = [falsy, null];
            callback = _ref4[0];
            falsy = _ref4[1];
        }
        falsy = falsy || [null, undefined];

        traverse(base, mirror, null, function (val, mv, key, paths, _ref5, objHasKey, mirHasKey) {
            var obj = _ref5.obj,
                mir = _ref5.mir;
            return callback({
                key: paths.join('.'),
                val: val,
                oldVal: mv,
                op: isFalsy(val) ? 'unset' : 'set',
                objHasKey: objHasKey,
                mirHasKey: mirHasKey
            });
        });
        unsetNonProp && traverse(mirror, base, null, function (val, bv, key, paths, _ref6, objHasKey, mirHasKey) {
            var mir = _ref6.mir;
            return !mirHasKey && callback({
                key: paths.join('.'),
                val: bv,
                oldVal: val,
                op: 'unset',
                objHasKey: objHasKey,
                mirHasKey: mirHasKey
            });
        });
    },
    diffToFlatten: function diffToFlatten(base, mirror) {
        var _ref7 = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {},
            falsy = _ref7.falsy,
            unsetNonProp = _ref7.unsetNonProp;

        var self = this,
            count = 0,
            res = {};

        self.diffObject(base, mirror, { falsy: falsy, unsetNonProp: unsetNonProp }, function (_ref8) {
            var key = _ref8.key,
                val = _ref8.val;

            res[key] = val;
            count++;
        });

        if (!count) {
            return;
        }
        return res;
    },
    flattenToModifier: function flattenToModifier(base, mirror) {
        var _ref9 = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {},
            falsy = _ref9.falsy,
            unsetNonProp = _ref9.unsetNonProp,
            unsetAs = _ref9.unsetAs;

        var self = this,
            count = 0,
            modifier = {};

        unsetAs = unsetAs || !mirror;

        self[mirror ? 'diffObject' : 'diffObj'](base, mirror, { falsy: falsy, unsetNonProp: unsetNonProp }, function (_ref10) {
            var key = _ref10.key,
                val = _ref10.val,
                oldVal = _ref10.oldVal,
                op = _ref10.op;

            op = '$' + op;
            var m = modifier[op] = modifier[op] || {};
            m[key] = val;
            if (op === '$unset') {
                m[key] = unsetAs || oldVal;
            }
            count++;
        });

        if (!count) {
            return;
        }
        return modifier;
    },
    multiUpdate: function multiUpdate(collection, selector, modifier, multi, isDone) {
        var count = 0;
        var flag = 1;
        var hasUpdateFailed = true;
        var result = void 0;
        if (!_.isFunction(isDone)) {
            isDone = function isDone() {
                return false;
            };
        }

        if (!multi) {
            hasUpdateFailed = collection.update(selector, modifier);
            return { hasUpdateFailed: hasUpdateFailed };
        }

        while (flag) {
            flag = collection.update(selector, modifier, { multi: true });
            count += flag;
            if (isDone(count)) {
                hasUpdateFailed = false;
                break;
            }
        }
        result = { success: count, hasUpdateFailed: hasUpdateFailed };
        return result;
    },
    errorParser: function errorParser(e) {
        var msg = e.message;

        var isDuplKey = /duplicate key error/.test(msg);
        var collection = /collection\: (\w+(\.\w+)+)/.exec(msg)[1];
        var index = /index\: ([\w\-]+)/.exec(msg)[1];
        var value = /dup key\: \{ (\w+( )?)?\: \"(\w+)\" \}/.exec(msg)[1];
        return { isDuplKey: isDuplKey, collection: collection, index: index, value: value };
    }
};

module.exports = MongoHelpers;