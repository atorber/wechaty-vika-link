import { Vika } from '@vikadata/vika'
import moment from 'moment'
import { v4 } from 'uuid'

class VikaBot {
  constructor(token) {
    this.vika = new Vika({ token })
    this.spaceId = ''
    this.sysTables = {}
    this.botRecords = {}
    this.secret = {}
    this.reportList = []
  }

  async getAllSpaces() {
    // 获取当前用户的空间站列表
    const spaceListResp = await this.vika.spaces.list()
    if (spaceListResp.success) {
      console.log(spaceListResp.data.spaces)
      return spaceListResp.data.spaces
    } else {
      console.error(spaceListResp)
      return spaceListResp
    }
  }

  async getSpaceId() {
    let spaceList = await this.getAllSpaces()
    for (let i in spaceList) {
      if (spaceList[i].name === 'mp-chatbot') {
        this.spaceId = spaceList[i].id
      }
    }
    return this.spaceId
  }

  async getNodesList() {
    // 获取指定空间站的一级文件目录
    const nodeListResp = await this.vika.nodes.list({ spaceId: this.spaceId })

    if (nodeListResp.success) {
      // console.log(nodeListResp.data.nodes);
      const nodes = nodeListResp.data.nodes
      nodes.forEach((node) => {
        // 当节点是文件夹时，可以执行下列代码获取文件夹下的文件信息
        if (node.type === 'Datasheet' && ['group', 'material', 'bot', 'ChatRecord'].indexOf(node.name) != -1) {
          this.sysTables[node.name] = node.id
        }
      })
    } else {
      console.error(nodeListResp)
    }
    return this.sysTables
  }

  async getRecordsList() {
    const datasheet = this.vika.datasheet(this.sysTables.bot)
    // 分页获取记录，默认返回第一页
    let response = await datasheet.records.query()
    if (response.success) {
      // console.log(response.data.records);
      const records = response.data.records
      const keys = ['contactList', 'lastUpdate', 'timeHms', 'userSelf', 'roomList', 'secret', 'reportList']
      records.forEach((record) => {
        // 当节点是文件夹时，可以执行下列代码获取文件夹下的文件信息
        if (keys.indexOf(record.fields.key) != -1) {
          this.botRecords[record.fields.key] = record.recordId
          if (record.fields.key === 'secret') {
            this.secret = JSON.parse(record.fields.value)
          }
          if (record.fields.key === 'reportList') {
            this.reportList = JSON.parse(record.fields.value)
          }
        }
      })
      keys.forEach((key) => {
        if (!this.botRecords[key]) {
          this.addBotKey(key)
        }
      })
    } else {
      console.error(response)
    }
    return this.botRecords
  }

  async addChatRecord(msg, ChatRecord) {
    // console.debug(JSON.stringify(msg))
    const talker = msg.talker()
    // console.debug(talker)
    const to = msg.to()
    const type = msg.type()
    let text = msg.text()
    let room = msg.room() || {}
    let topic = ''
    if (room) {
      topic = await room.topic()
    }
    let curTime = this.getCurTime()
    let reqId = v4()
    let ID = msg.id
    let msg_type = msg.type()
    let timeHms = moment(curTime).format('YYYY-MM-DD HH:mm:ss')
    let files = []
    if (msg_type == '123') {
      let file = await this.upload(ChatRecord, 'url')
      files.push(file)
    }
    let records = [
      {
        fields: {
          ID: ID,
          时间: timeHms,
          来自: talker.name(),
          接收: topic || '单聊',
          内容: text,
          发送者ID: talker.id != 'null' ? talker.id : '--',
          接收方ID: room.id ? room.id : '--',
          消息类型: msg_type,
          附件: files,
        },
      },
    ]
    // console.debug(records)
    const datasheet = this.vika.datasheet(ChatRecord)
    datasheet.records.create(records).then((response) => {
      if (response.success) {
        console.log(response.code)
      } else {
        console.error(response)
      }
    })
  }

  async upload(url, ChatRecord,) {
    const datasheet = this.vika.datasheet(ChatRecord);
    // node 环境中
    const file = fs.createReadStream(url)

    try {
      const resp = await datasheet.upload(file)
      if (resp.success) {
        const uploaded_attachments = resp.data
        // await vika.datasheet('dstWUHwzTHd2YQaXEE').records.create([{
        //   'title': '标题 A',
        //   'photos': [uploaded_attachments]
        // }])
        return uploaded_attachments
      }
    } catch (error) {
      console.error(error)
    }
  }

  async addBotKey(key) {
    let records = [
      {
        fields: {
          key: key,
          value: '',
        },
      },
    ]
    const response = await this.vika.datasheet(this.sysTables.bot).records.create(records)

    if (response.success) {
      console.log('创建bot-key成功：', key)
      this.botRecords[key] = response.data.records[0].recordId
    } else {
      console.error(response)
    }
  }

  async updateBot(key, value, bot) {
    const datasheet = this.vika.datasheet(bot)
    datasheet.records
      .update([
        {
          recordId: this.botRecords[key],
          fields: {
            key: key,
            value: value,
          },
        },
      ])
      .then((response) => {
        if (response.success) {
          console.log(key, ':', response.code)
        } else {
          console.error(response)
        }
      })
  }

  async getSecret() {
    return this.secret
  }
  async checkInit() {
    this.spaceId = await this.getSpaceId()
    console.debug('mp-chatbot空间ID:', this.spaceId)

    if (this.spaceId) {
      this.sysTables = await this.getNodesList()
      console.debug('sysTables初始化表:', this.sysTables)
    } else {
      console.debug('mp-chatbot空间不存在')
    }
    if (Object.keys(this.sysTables).length == 4) {
      let RecordsList = await this.getRecordsList()
      console.debug('bot表:', RecordsList)
      if (this.secret) {
        console.debug(this.secret)
        console.debug('配置检查通过')
      } else {
        console.debug('secret未配置')
      }
    } else {
      console.debug('缺失必须的表！！！！！！', Object.keys(this.sysTables))
    }

    return {
      spaceId: this.spaceId,
      sysTables: this.sysTables,
      botRecords: this.botRecords,
    }
  }

  getCurTime() {
    //timestamp是整数，否则要parseInt转换
    let timestamp = new Date().getTime()
    var timezone = 8 //目标时区时间，东八区
    var offset_GMT = new Date().getTimezoneOffset() // 本地时间和格林威治的时间差，单位为分钟
    var time = timestamp + offset_GMT * 60 * 1000 + timezone * 60 * 60 * 1000
    return time
  }
}

export { VikaBot }

export default VikaBot
