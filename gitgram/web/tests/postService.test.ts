/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import api from '@/services/api'
import { postService } from '@/services/postService'

const mock = new MockAdapter(api)

describe('postService', () => {
  beforeEach(() => {
    mock.reset()
  })

  describe('getFeed', () => {
    it('should fetch feed with default pagination', async () => {
      mock.onGet('/v1/posts/feed').reply(200, {
        posts: [{ id: '1', content: 'Hello' }],
        hasMore: true,
      })

      const result = await postService.getFeed()
      expect(result.posts).toHaveLength(1)
      expect(result.posts[0].id).toBe('1')
    })

    it('should pass custom page and limit', async () => {
      mock.onGet('/v1/posts/feed').reply((config) => {
        expect(config.params).toEqual({ page: 2, limit: 5 })
        return [200, { posts: [], hasMore: false }]
      })

      await postService.getFeed(2, 5)
    })
  })

  describe('getPost', () => {
    it('should fetch a single post by ID', async () => {
      mock.onGet('/v1/posts/abc123').reply(200, {
        id: 'abc123',
        content: 'Test post',
        user: { username: 'user1' },
      })

      const result = await postService.getPost('abc123')
      expect(result.id).toBe('abc123')
    })

    it('should throw on 404', async () => {
      mock.onGet('/v1/posts/notfound').reply(404)
      await expect(postService.getPost('notfound')).rejects.toThrow()
    })
  })

  describe('likePost / unlikePost', () => {
    it('should like a post', async () => {
      mock.onPost('/v1/posts/p1/like').reply(200, { liked: true, likesCount: 6 })
      const result = await postService.likePost('p1')
      expect(result.liked).toBe(true)
    })

    it('should unlike a post', async () => {
      mock.onDelete('/v1/posts/p1/like').reply(200)
      await expect(postService.unlikePost('p1')).resolves.not.toThrow()
    })
  })

  describe('comments', () => {
    it('should fetch comments for a post', async () => {
      mock.onGet('/v1/posts/p1/comments').reply(200, {
        comments: [{ id: 'c1', content: 'Nice!' }],
      })

      const result = await postService.getComments('p1')
      expect(result.comments).toHaveLength(1)
    })

    it('should add a comment', async () => {
      mock.onPost('/v1/posts/p1/comments').reply(201, {
        id: 'c-new',
        content: 'My comment',
      })

      const result = await postService.addComment('p1', 'My comment')
      expect(result.id).toBe('c-new')
    })

    it('should delete a comment', async () => {
      mock.onDelete('/v1/posts/p1/comments/c1').reply(200)
      await expect(postService.deleteComment('p1', 'c1')).resolves.not.toThrow()
    })
  })

  describe('save / unsave', () => {
    it('should save a post', async () => {
      mock.onPost('/v1/post-actions/save/p1').reply(200, { saved: true })
      const result = await postService.savePost('p1')
      expect(result.saved).toBe(true)
    })

    it('should unsave a post', async () => {
      mock.onDelete('/v1/post-actions/save/p1').reply(200)
      await expect(postService.unsavePost('p1')).resolves.not.toThrow()
    })
  })

  describe('deletePost', () => {
    it('should delete a post', async () => {
      mock.onDelete('/v1/posts/p1').reply(200)
      await expect(postService.deletePost('p1')).resolves.not.toThrow()
    })
  })

  describe('checkpoint-linked creation', () => {
    it('should append AITM checkpoint fields when creating a post', async () => {
      mock.onPost('/v1/posts').reply((config) => {
        const body = config.data as FormData

        expect(body.get('content')).toBe('Checkpoint-aware post')
        expect(body.get('checkpointId')).toBe('cp_123')
        expect(body.get('aitmProjectId')).toBe('proj_123')
        expect(body.get('fromCheckpointId')).toBe('cp_122')
        expect(body.get('diffSummary')).toBe(JSON.stringify({ added: 10, removed: 2, modified: 3 }))
        expect(body.get('changedFiles')).toBe(JSON.stringify(['src/index.ts', 'README.md']))
        expect(body.get('changeStoryTitle')).toBe('Checkpoint Rollup')

        return [201, { id: 'post_checkpoint_1' }]
      })

      const formData = new FormData()
      formData.append('content', 'Checkpoint-aware post')

      const result = await postService.createPostWithCheckpoint(formData, {
        checkpointId: 'cp_123',
        projectId: 'proj_123',
        fromCheckpointId: 'cp_122',
        diffSummary: { added: 10, removed: 2, modified: 3 },
        changedFiles: ['src/index.ts', 'README.md'],
        changeStoryTitle: 'Checkpoint Rollup',
      })

      expect(result.id).toBe('post_checkpoint_1')
    })

    it('should create a post from the dedicated checkpoint endpoint', async () => {
      mock.onPost('/v1/posts/from-checkpoint').reply((config) => {
        expect(JSON.parse(config.data)).toEqual({
          checkpointId: 'cp_200',
          projectId: 'proj_200',
          message: 'Share this checkpoint',
          visibility: 'public',
        })

        return [201, { id: 'post_from_checkpoint_1' }]
      })

      const result = await postService.createPostFromCheckpoint({
        checkpointId: 'cp_200',
        projectId: 'proj_200',
        message: 'Share this checkpoint',
        visibility: 'public',
      })

      expect(result.id).toBe('post_from_checkpoint_1')
    })
  })
})
