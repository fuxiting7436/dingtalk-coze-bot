const https = require('https');

// ========== 你的配置信息 ==========
const COZE_CONFIG = {
  apiUrl: 'https://xqt7rp27c9.coze.site/stream_run',
  apiToken: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjE4NjZjYzMyLWNmZGYtNDM3Ni1iMDNhLWE1Nzk4NDk5NzJlMCJ9.eyJpc3MiOiJodHRwczovL2FwaS5jb3plLmNuIiwiYXVkIjpbIll3TjZ4Y3E5blZwU0V0cWU2ZnQyajRjNFdmcmRpQ29BIl0sImV4cCI6ODIxMDI2Njg3Njc5OSwiaWF0IjoxNzc1NDQyMzcxLCJzdWIiOiJzcGlmZmU6Ly9hcGkuY296ZS5jbi93b3JrbG9hZF9pZGVudGl0eS9pZDo3NjI1NDY1MTU1MzU0MDk5NzE4Iiwic3JjIjoiaW5ib3VuZF9hdXRoX2FjY2Vzc190b2tlbl9pZDo3NjI1NDY2OTE5Nzg0NTQ2MzIzIn0.E35ZvQivPqfWOHscVyzW1_jP0jS0jkSs8mELwcAslar1m_PfeIaM83BGdNOG8bQFqBYECW_Df81dgkkfOWZd94GYyDC6yjN2sSEpG7MGiCsSYgCkbtO3B3Sw15E4j_fVIPYgaMmecy77GKIvV5S3dl8wA1kIprhC5dgupke6G2Empj8ukK02HEuk3zwZb0fgpbztducIXeVTuuLSAHQDa3AkKOoalQ_5MhcXtfgmGpZAx3ypFKPYh3vAMT9dOttnu_abyocNrWhsSSeu__VkQx-JLBgbSdL9GyC6zlE3J_9wxQjhZ_CCz4H5ItQuhS-ngousiB3-oCVmS0EdFr4wvA'
};

// ========== 调用扣子API ==========
function callCozeAPI(userMessage) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      input: {
        messages: [
          {
            role: 'user',
            content: userMessage,
            content_type: 'text'
          }
        ]
      }
    });

    const options = {
      hostname: 'xqt7rp27c9.coze.site',
      port: 443,
      path: '/stream_run',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COZE_CONFIG.apiToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const jsonMatch = data.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const jsonData = JSON.parse(jsonMatch[0]);
              const reply = jsonData.data?.output?.text || 
                           jsonData.data?.messages?.[0]?.content ||
                           jsonData.output?.text ||
                           '智能体已响应，但无法解析内容';
              resolve(reply);
            } else {
              resolve(data || '智能体已响应');
            }
          } catch (e) {
            resolve(data || '智能体响应解析失败');
          }
        } else {
          resolve(`智能体调用失败 (状态码: ${res.statusCode})`);
        }
      });
    });

    req.on('error', (e) => {
      console.error('扣子API调用错误:', e.message);
      resolve('智能体服务暂时不可用，请稍后再试');
    });

    req.write(postData);
    req.end();
  });
}

// ========== 发送消息到钉钉 ==========
function sendToDingTalk(webhookUrl, content, atUserIds = []) {
  return new Promise((resolve, reject) => {
    const messageBody = JSON.stringify({
      msgtype: 'text',
      text: {
        content: content
      },
      at: {
        atUserIds: atUserIds,
        isAtAll: false
      }
    });

    const parsedUrl = new URL(webhookUrl);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(messageBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', (e) => {
      console.error('钉钉消息发送失败:', e.message);
      reject(e);
    });

    req.write(messageBody);
    req.end();
  });
}

// ========== Vercel Serverless Function ==========
export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理OPTIONS预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 健康检查
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: '钉钉-扣子桥接服务运行正常',
      version: 'vercel-serverless'
    });
  }

  // 处理钉钉消息
  if (req.method === 'POST') {
    try {
      const data = req.body;
      const { msgtype, text, senderNick, senderId, sessionWebhook, conversationId } = data;
      
      console.log('收到消息:', {
        sender: senderNick,
        type: msgtype,
        content: text?.content
      });
      
      // 只处理文本消息
      if (msgtype !== 'text' || !text?.content) {
        return res.status(200).json({
          msgtype: 'text',
          text: { content: '暂仅支持文本消息' }
        });
      }
      
      const userMessage = text.content.trim();
      
      // 调用扣子API
      const cozeReply = await callCozeAPI(userMessage);
      console.log('扣子回复:', cozeReply);
      
      // 发送到钉钉
      if (sessionWebhook) {
        await sendToDingTalk(sessionWebhook, cozeReply, [senderId]);
      }
      
      // 响应钉钉
      return res.status(200).json({
        msgtype: 'text',
        text: { content: cozeReply }
      });
      
    } catch (error) {
      console.error('处理错误:', error);
      return res.status(200).json({
        msgtype: 'text',
        text: { content: '处理消息时发生错误，请稍后再试' }
      });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}
