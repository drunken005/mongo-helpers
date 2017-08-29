/**
 * Created on 2017/8/28.
 * @fileoverview 请填写简要的文件说明.
 * @author event (xiangYuan geng)
 */

const _ = require('lodash');

let _isArrayObj = function (val) {
    if (!_.isArray(val)) {
        return true;
    }
    let isObject = false;
    _.each(val, (doc)=>_.isObject(doc) && ( isObject = true));
    return isObject;
};

let MongoHelpers = {
    /**
     * 将一个文档扁平化，例如，使用该方法处理对象{a: {b: [{aa: 1, bb: 1}]}}，将会获得{'a.b.0.aa': 1, 'a.b.0.bb': 1}
     * @param obj
     * @returns {*|{}}
     */
    flatten (obj) {
        let handler = function (obj, copy, keyBase) {
            copy = copy || {};
            keyBase = keyBase || '';
            _.each(obj, (val, key) => {
                let _key = keyBase + ((keyBase ? '.' : '') + key);
                if ((_.isObject(val) && !_.isDate(val) && (!_.isArray(val) || _isArrayObj(val)))) {
                    _.extend(copy, handler(val, copy, _key));
                    return;
                }
                copy[_key] = val;
            });
            return copy;
        };

        return handler(obj);
    },
    /**
     * 将一个扁平化处理的对象重建为一个对象
     * @param flatten
     */
    rebuild (flatten) {
        let copy = [];

        _.each(flatten, function (val, key) {
            let paths = key.split('.');
            let levels = [];
            let lastPath;
            let c = copy;
            paths.forEach((path, idx) => {
                let pathIsNum = /^\d+$/.test(path);
                if (!pathIsNum && _.isArray(c)) {
                    let o = {};
                    c.forEach((v, k) => o[k] = v);
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
    /**
     * 对比两个对象，并获得差异部分，将其按取值分别分配到unset和set集中，
     * 这个方法是 `MongoHelpers.diffObject()` 的简单版本，
     * 会先将传入的对象扁平化后再进行键值对比
     * @param base {Object}
     * @param mirror {Object}
     * @param falsy {Array.<any>}
     * @param unsetNonProp {boolean} 是否base中未包含的属性加入至unset集
     * @param callback {Function} 差异部分处理回调
     */
    diffObj (base, mirror, {falsy, unsetNonProp} = {}, callback) {
        let self = this;
        let keys = _.keys(base);
        base = self.flatten(base);
        mirror = mirror && self.flatten(_.pick(mirror, keys));
        if (_.isFunction(falsy)) {
            [callback, falsy] = [falsy, null];
        }
        falsy = falsy || [null, undefined];
        let isFalsy = function (val) {
            return _.includes(falsy, val);
        };

        _.each(base, (val, key) => {
            if (isFalsy(val)) {
                callback({key, val, op: 'unset'});
            } else if (!mirror || !_.isEqual(mirror[key], val)) {
                callback({key, val, op: 'set'});
            }
        });

        unsetNonProp && mirror && _.each(mirror, (val, key) => {
            if (!base.hasOwnProperty(key) && isFalsy(val)) {
                callback({key, val, op: 'unset'});
            }
        });
    },
    /**
     * 对比两个对象，并获得差异部分，将其按取值分别分配到unset和set集中
     * @param base {Object}
     * @param mirror {Object}
     * @param falsy {Array.<any>}
     * @param unsetNonProp {boolean} 是否base中未包含的属性加入至unset集
     * @param callback {Function} 差异部分处理回调
     */
    diffObject (base, mirror, {falsy, unsetNonProp} = {}, callback) {
        let isNotSimpleArray = function (val) {
            return !_.isArray(val) || _isArrayObj(val);
        };
        let isObject = function (val) {
            return val && _.isObject(val) && !_.isDate(val) && isNotSimpleArray(val);
        };
        let isFalsy = function (val) {
            return _.includes(falsy, val);
        };
        let traverse = function (obj, mir, parents, handle) {
            if (!obj) {
                return;
            }
            parents = parents || [];
            obj && _.each(obj, (val, key) => {
                let paths = parents.concat([key]);
                let ov = mir && mir[key];
                if (_.isEqual(val, ov)) {
                    return;
                }
                if (isObject(val) && isObject(ov)) {
                    return traverse(val, ov, paths, handle);
                }
                let objHasKey = obj.hasOwnProperty(key);
                let mirHasKey = mir.hasOwnProperty(key);
                handle(val, ov, key, paths, {obj, mir}, objHasKey, mirHasKey);
            });
        };

        if (_.isFunction(falsy)) {
            [callback, falsy] = [falsy, null];
        }
        falsy = falsy || [null, undefined];

        let keys = _.keys(base);
        mirror = mirror && _.pick(mirror, keys);
        traverse(base, mirror, null, (val, mv, key, paths, {obj, mir}, objHasKey, mirHasKey) =>
            callback({
                key: paths.join('.'),
                val,
                oldVal: mv,
                op: isFalsy(val) ? 'unset' : 'set',
                objHasKey,
                mirHasKey
            })
        );
        unsetNonProp && traverse(mirror, base, null, (val, bv, key, paths, {mir}, objHasKey, mirHasKey) =>
        !mirHasKey && callback({
            key: paths.join('.'),
            val: bv,
            oldVal: val,
            op: 'unset',
            objHasKey,
            mirHasKey
        })
        );
    },
    /**
     * 将传入的文档扁平化后，对比键值对，获得两个对象的差异部分
     * @param base {Object}
     * @param mirror {Object}
     * @param falsy {Array.<any>}
     * @param unsetNonProp {boolean} 是否base中未包含的属性加入至unset集
     * @returns {{}}
     */
    diffToFlatten (base, mirror, {falsy, unsetNonProp} = {}) {
        let self = this,
            count = 0,
            res = {};

        self.diffObject(base, mirror, {falsy, unsetNonProp}, ({key, val}) => {
            res[key] = val;
            count++;
        });

        if (!count) {
            return;
        }
        return res;
    },
    /**
     * 将传入的文档扁平化后，对比键值对，获得modifier(包含$set和$unset)
     * @param base {Object}
     * @param mirror {Object} 镜像
     * @param falsy {Array.<any>} 自定义的假值
     * @param unsetNonProp {boolean} 是否base中未包含的属性加入至unset集
     * @param unsetAs {any} 设置unset集中的键值
     * @returns {{}}
     */
    flattenToModifier (base, mirror, {falsy, unsetNonProp, unsetAs} = {}) {
        let self = this,
            count = 0,
            modifier = {};

        unsetAs = unsetAs || !mirror;

        self[mirror ? 'diffObject' : 'diffObj'](base, mirror, {falsy, unsetNonProp}, ({key, val, oldVal, op}) => {
            op = '$' + op;
            let m = modifier[op] = modifier[op] || {};
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
    multiUpdate (collection, selector, modifier, multi, isDone) {
        let count = 0;
        let flag = 1;
        let hasUpdateFailed = true;
        let result;
        if (!_.isFunction(isDone)) {
            isDone = function () {
                return false;
            };
        }

        if (!multi) {
            hasUpdateFailed = collection.update(selector, modifier);
            return {hasUpdateFailed};
        }

        while (flag) {
            flag = collection.update(selector, modifier, {multi: true});
            count += flag;
            if (isDone(count)) {
                hasUpdateFailed = false;
                break;
            }
        }
        result = {success: count, hasUpdateFailed};
        return result;
    },
    /**
     * mongodb异常解析器，目前仅能解析插入重复键异常
     * @param e
     * @returns {{isDuplKey: boolean, collection: *, index: *, value: *}}
     */
    errorParser (e) {
        let msg = e.message;
        //E11000 duplicate key error collection: duolayimeng.clothes index: _id_ dup key: { : "1521111" }
        let isDuplKey = /duplicate key error/.test(msg);
        let collection = /collection\: (\w+(\.\w+)+)/.exec(msg)[1];
        let index = /index\: ([\w\-]+)/.exec(msg)[1];
        let value = /dup key\: \{ (\w+( )?)?\: \"(\w+)\" \}/.exec(msg)[1];
        return {isDuplKey, collection, index, value};
    }
};

module.exports = MongoHelpers;