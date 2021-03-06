/* eslint-disable default-case,no-undef,no-return-await */
const Base = require('./Base')
const jwt = require('jsonwebtoken')

module.exports = class extends Base {
  constructor(ctx) {
    super(ctx);
    this.DAO = this.model('users')
    this.metaDAO = this.model('usermeta')
  }

  async indexAction () {

    if (this.isPost) {
      await this.postAction()
    }
    if (this.isGet) {
      await this.getAction()
    }

  }

  async getAction () {
    const userId = this.get('id')
    const appid = this.get('appId')
    const userMeta = this.model('usermeta')
    let type = this.get('type')
    // 根据 id 获取单用户
    if (!think.isEmpty(userId)) {
      let user = await this.model('users').where({id: userId}).find()
      _formatOneMeta(user)
      if (!think.isEmpty(user.meta[`picker_${appid}_wechat`])) {
        user.avatarUrl = user.meta[`picker_${appid}_wechat`].avatarUrl
        // user.type = 'wechat'
        user = Object.assign(user, user.meta[`picker_${appid}_wechat`])
      } else {
        user.avatarUrl = await this.model('postmeta').getAttachment('file', user.meta.avatar)
      }
      return this.success(user)
    } else {
      if (think.isEmpty(type)) {
        type = 'team'
      }
      // 获取用户默认获取团队成员
      // const userIds = await userMeta.where(query).select()
      const userMetaDatas = await userMeta.where(`meta_value ->'$.type' = '${type}' and meta_key = 'picker_${appid}_capabilities'`)
        .page(this.get('page'), 12).countSelect()
      if (!think.isEmpty(userMetaDatas) && userMetaDatas.count > 0) {
        const ids = []
        for (const item of userMetaDatas.data) {
          ids.push(item.user_id)
        }
        userMetaDatas.data = []

        // userIds.data.forEach((item) => {
        //   ids.push(item.user_id)
        // })
        const users = await this.model('users').where({id: ['IN', ids]}).select()
        _formatMeta(users)
        for (let user of users) {
          if (!think.isEmpty(user.meta.avatar)) {
            user.avatarUrl = await this.model('postmeta').getAttachment('file', user.meta.avatar)
          } else if (!think.isEmpty(user.meta[`picker_${appid}_wechat`])) {
            user.avatarUrl = user.meta[`picker_${appid}_wechat`].avatarUrl
            user = Object.assign(user, user.meta[`picker_${appid}_wechat`])
            // user.type = 'wechat'
            Reflect.deleteProperty(user, 'meta')
          }
        }
        userMetaDatas.data = users
        return this.success(userMetaDatas)
      }
      return this.success(userMetaDatas)
    }
  }
  async postAction () {
    const data = this.post()
    const approach = this.post('approach')
    // 注册用户来源
    switch(approach) {
      // 微信小程序
      case 'wxapp': {
        // 判断用户是否已注册
        const wxUser = await this.model('users').getByWxApp(data.openId)
        if (!think.isEmpty(wxUser)) {
          // 获取 token
          const token = await this.createToken(approach, data)
          return this.success({userId: wxUser.id, token: token, token_type: 'Bearer'})
        } else {
          const userInfo = {
            appid: this.appId,
            user_login: data.openId,
            user_nicename: data.nickName,
            wxapp: data
          }
          const userId = await this.model('users').addWxAppUser(userInfo)
          const token = await this.createToken(approach, data)
          return this.success({userId: userId, token: token, token_type: 'Bearer'})
        }
      }
      default: {
        data.appid = this.appId
        const userId = await this.model('users').addUser(data)
        return this.success(userId)
      }
    }
  }

  async putAction () {
    const data = this.post()
    const approach = this.post('approach')
    // 注册用户来源
    switch(approach) {
      // 微信小程序
      case 'wxapp': {
        // 判断用户是否已注册
        const wxUser = await this.DAO.getByWxApp(data.openId)
        if (!think.isEmpty(wxUser)) {
          // 获取 token
          const token = await this.createToken(approach, data)
          return this.success({userId: wxUser.id, token: token, token_type: 'Bearer'})
        } else {
          const userInfo = {
            appid: this.appId,
            user_login: data.openId,
            user_nicename: data.nickName,
            wxapp: data
          }
          const userId = await this.DAO.addWxAppUser(userInfo)
          const token = await this.createToken(approach, data)
          return this.success({userId: userId, token: token, token_type: 'Bearer'})
        }
      }
      default: {
        // if (!this.id) {
        //   return this.fail('params error');
        // }
        // const pk = this.modelInstance.pk;
        // delete data[pk];
        if (think.isEmpty(data)) {
          return this.fail('data is empty');
        }
        // 更新
        // const currentTime = new Date().getTime();
        // data.modified = currentTime
        data.appId = this.appId
        await this.DAO.save(data)
        return this.success()
        // const res = await this.DAO.where({id: data.id}).update(data);
        // if (res > 0) {
        //   更新 meta 图片数据
          // if (!Object.is(data.meta, undefined)) {
          //   const res = await this.metaDAO.save(data.id, data.meta)
          //   if (res) {
          //     return this.success()
          //   } else {
          //     return this.fail('Update fail')
          //   }
          //   const metaModel = await this.model('postmeta', {appId: this.appId})
          //   保存 meta 信息
          //   await metaModel.save(this.id, data.meta)
          // }
        // } else {
        //   return this.fail('Update fail')
        // }

        // return this.success()
      }
    }
  }

  // Get details of a user of a site by login.
  async loginAction () {
    const userLogin = this.get('user_login')
    if (think.isEmpty(userLogin)) {
      return this.fail('User login is Empty')
    }
    const user = await this.DAO.field([
      'id',
      'user_login as login',
      'user_email as email',
      'user_nicename as nicename'
    ]).where({
      user_login: userLogin
    }).find()

    // Reflect.deleteProperty(user, 'metas')
    _formatOneMeta(user)
    user.avatar = await this.model('postmeta').getAttachment('file', user.meta.avatar)
    if (!Object.is(user.meta.resume, undefined)) {
      user.resume = user.meta.resume
    }
    // 删除无用 meta 值
    Reflect.deleteProperty(user, 'meta')
    // if (user.meta.meta_key.includes('_capabilities') && user.meta.meta_key.includes('picker_')) {
    //   Object.assign(user, JSON.parse(meta.meta_value))
    // }
    // "ID": 18342963,
    //   "login": "binarysmash",
    //   "email": false,
    //   "name": "binarysmash",
    //   "URL": "http:\/\/binarysmash.wordpress.com",
    //   "avatar_URL": "http:\/\/0.gravatar.com\/avatar\/a178ebb1731d432338e6bb0158720fcc?s=96&d=identicon&r=G",
    //   "profile_URL": "http:\/\/en.gravatar.com\/binarysmash",
    //   "roles": [
    //   "administrator"
    // ]
    return this.success(user)
  }
  /**
   * 根据用户来源创建 token
   * @param approach
   * @param data
   * @returns {Promise.<*>}
   */
  async createToken(approach, data) {
    switch (approach) {
      case 'password': {
        break
      }
      case 'wxapp': {
        const token = jwt.sign(data, 'shared-secret', {expiresIn: '3d'})
        return token
      }
    }
    // const token = jwt.sign(userInfo, 'shared-secret', {expiresIn: '3d'})
    // user: userInfo.user_login,
    // return this.success({user: userInfo.user_login, token: token});
  }

  /**
   * 按类别查找用户发布的内容
   * @returns {Promise<void>}
   */
  async postsAction () {
    const category = this.get('category')
    if (think.isEmpty(category)) {
      return this.fail('分类不能为空')
    }
    // const curUser = this.get('id')
    const postsApi = this.model('posts', {appId: this.appId})
    const list = await postsApi.findByAuthorPost(category, this.get('id'), this.get('page'), this.get('pagesize'))
    return this.success(list)
  }
}
