
import redis.asyncio as redis
import json
from typing import Dict, Any, Callable
import logging

logger = logging.getLogger(__name__)

class MessageQueue:
    """Redis Pub/Sub for agent communication"""

    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.redis_client = None
        self.pubsub = None

    async def connect(self):
        """Connect to Redis"""
        try:
            self.redis_client = await redis.from_url(
                self.redis_url, 
                decode_responses=True,
                socket_timeout=2.0,
                socket_connect_timeout=2.0
            )
            # Actually test the connection
            await self.redis_client.ping()
            self.pubsub = self.redis_client.pubsub()
            logger.info(f"✅ Connected to Redis message queue at {self.redis_url}")
        except Exception as e:
            logger.warning(f"⚠️ Redis connection failed: {e}. Running in standalone (mock) mode.")
            self.redis_client = None
            self.pubsub = None

    async def disconnect(self):
        """Disconnect from Redis"""
        if self.pubsub:
            await self.pubsub.close()
        if self.redis_client:
            await self.redis_client.close()
        logger.info("🔌 Disconnected from Redis message queue")

    async def publish(self, channel: str, message: Dict[str, Any]):
        """Publish message to channel"""
        if not self.redis_client:
            logger.warning(f"⚠️ Redis not connected. Skipping publish to {channel}.")
            return
        
        message_json = json.dumps(message)
        await self.redis_client.publish(channel, message_json)
        logger.debug(f"Published to {channel}: {message.get('action', 'unknown')}")

    async def subscribe(self, channel: str, handler: Callable):
        """Subscribe to channel and handle messages"""
        if not self.pubsub:
            await self.connect()
            
        await self.pubsub.subscribe(channel)
        logger.info(f"📡 Subscribed to channel: {channel}")

        async for message in self.pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    await handler(data)
                except Exception as e:
                    logger.error(f"❌ Error handling message on channel {channel}: {e}")
