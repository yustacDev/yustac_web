/*!
 * nodeclub - site index controller.
 * Copyright(c) 2012 fengmk2 <fengmk2@gmail.com>
 * Copyright(c) 2012 muyuan
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var User         = require('../proxy').User;
var Topic        = require('../proxy').Topic;
var config       = require('../config');
var eventproxy   = require('eventproxy');
var cache        = require('../common/cache');
var xmlbuilder   = require('xmlbuilder');
var renderHelper = require('../common/render_helper');
var _            = require('lodash');

exports.index = function (req, res, next) {
  var currentUser = req.session.user;
  var page = parseInt(req.query.page, 10) || 1;
  page = page > 0 ? page : 1;
  var tab = req.query.tab || 'all';

  var proxy = new eventproxy();
  proxy.fail(next);

  // 得到所有的 adminTabs, e.g. ['workshop', ..]
  var allAdminTabs = config.adminTabs.map(function(tPair){
    return tPair[0]
  });

  //访问管理员专用,提示无权限
  if((currentUser && !currentUser.is_admin && allAdminTabs.indexOf(tab)!=-1)){
    res.status(403);
    return res.send({success: false, message: '无权限'});
  }

  // 取主题
  var query = {};

  if((currentUser && !currentUser.is_admin)|| !currentUser){
    if (tab && tab !== 'all') {
      if (tab === 'good') {
        query.tab = { $ne: allAdminTabs,$eq:tab };
        query.good = true;
      } else {
        query.tab = { $ne: allAdminTabs,$eq:tab };
      }
    }else{
      query.tab = { $ne: allAdminTabs}
    }
  }else {
    if (tab && tab !== 'all') {
      if (tab === 'good') {
        query.good = true;
      } else {
        query.tab = tab;
      }
    }
  }


  var limit = config.list_topic_count;
  var options = { skip: (page - 1) * limit, limit: limit, sort: '-top -last_reply_at'};

  Topic.getTopicsByQuery(query, options, proxy.done('topics', function (topics) {
    return topics;
  }));

  // 取排行榜上的用户
  cache.get('tops', proxy.done(function (tops) {
    if (tops) {
      proxy.emit('tops', tops);
    } else {
      User.getUsersByQuery(
        {is_block: false},
        { limit: 10, sort: '-score'},
        proxy.done('tops', function (tops) {
          cache.set('tops', tops, 60 * 1);
          return tops;
        })
      );
    }
  }));
  // END 取排行榜上的用户

  //取被看过最多的帖子
  cache.get('most_visited_topics',proxy.done(function(most_visited_topics){
    if(most_visited_topics){
      proxy.emit('most_visited_topics', most_visited_topics);
    }else{
      Topic.getTopicsByQuery(
          { tab: {$ne: allAdminTabs}},
          { limit: 5, sort: '-visit_count'},
          proxy.done('most_visited_topics', function (most_visited_topics) {
            cache.set('most_visited_topics', most_visited_topics, 60 * 1);
            return most_visited_topics;
          }));
    }
  }));
  //END 取被看过最多的帖子

  // 取0回复的主题
  //cache.get('no_reply_topics', proxy.done(function (no_reply_topics) {
  //  if (no_reply_topics) {
  //    proxy.emit('no_reply_topics', no_reply_topics);
  //  } else {
  //    Topic.getTopicsByQuery(
  //      { reply_count: 0, tab: {$ne: allAdminTabs}},
  //      { limit: 5, sort: '-create_at'},
  //      proxy.done('no_reply_topics', function (no_reply_topics) {
  //        cache.set('no_reply_topics', no_reply_topics, 60 * 1);
  //        return no_reply_topics;
  //      }));
  //  }
  //}));
  // END 取0回复的主题

  // 取分页数据
  var pagesCacheKey = JSON.stringify(query) + 'pages';
  cache.get(pagesCacheKey, proxy.done(function (pages) {
    if (pages) {
      proxy.emit('pages', pages);
    } else {
      Topic.getCountByQuery(query, proxy.done(function (all_topics_count) {
        var pages = Math.ceil(all_topics_count / limit);
        cache.set(pagesCacheKey, pages, 60 * 1);
        proxy.emit('pages', pages);
      }));
    }
  }));
  // END 取分页数据

  var tabName = renderHelper.tabName(tab);
  proxy.all('topics', 'tops', 'most_visited_topics', 'pages',
    function (topics, tops, most_visited_topics, pages) {
      res.render('index', {
        topics: topics,
        current_page: page,
        list_topic_count: limit,
        tops: tops,
        most_visited_topics: most_visited_topics,
        pages: pages,
        tabs: config.tabs,
        adminTab:config.adminTabs,
        tab: tab,
        pageTitle: tabName && (tabName + '版块'),
      });
    });
};

exports.sitemap = function (req, res, next) {
  var urlset = xmlbuilder.create('urlset',
    {version: '1.0', encoding: 'UTF-8'});
  urlset.att('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');

  var ep = new eventproxy();
  ep.fail(next);

  ep.all('sitemap', function (sitemap) {
    res.type('xml');
    res.send(sitemap);
  });

  cache.get('sitemap', ep.done(function (sitemapData) {
    if (sitemapData) {
      ep.emit('sitemap', sitemapData);
    } else {
      Topic.getLimit5w(function (err, topics) {
        if (err) {
          return next(err);
        }
        topics.forEach(function (topic) {
          urlset.ele('url').ele('loc', 'http://cnodejs.org/topic/' + topic._id);
        });

        var sitemapData = urlset.end();
        // 缓存一天
        cache.set('sitemap', sitemapData, 3600 * 24);
        ep.emit('sitemap', sitemapData);
      });
    }
  }));
};

exports.appDownload = function (req, res, next) {
  if (/Android/i.test(req.headers['user-agent'])) {
    res.redirect('http://fir.im/ks4u');
  } else {
    res.redirect('https://itunes.apple.com/cn/app/id954734793');
  }
};
